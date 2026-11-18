import "server-only";
import type { z } from "zod";
import type { LeadType } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import { writeAudit, type AuditActor } from "@/modules/audit/audit.service";
import type { CurrentUser } from "@/modules/auth/current";
import { notify } from "@/modules/notifications/notifications.service";
import { canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { isOpenStatus, pickRoundRobin } from "./lead-logic";
import {
  istLocalToDate,
  LEAD_TYPE_LABELS,
  type activitySchema,
  type assignLeadSchema,
  type leadSchema,
  type statusChangeSchema,
} from "./leads.schemas";

// ------------------------------------------------------------------ helpers

async function startingStatus(tx: Tx, orgId: string) {
  const s =
    (await tx.leadStatus.findFirst({ where: { organizationId: orgId, isActive: true, isDefault: true } })) ??
    (await tx.leadStatus.findFirst({
      where: { organizationId: orgId, isActive: true, isWon: false, isLost: false },
      orderBy: { sortOrder: "asc" },
    }));
  if (!s) throw new ActionError("Set up lead statuses first (Settings → Master data → Lead statuses).");
  return s;
}

async function wonStatus(tx: Tx, orgId: string) {
  return tx.leadStatus.findFirst({
    where: { organizationId: orgId, isActive: true, isWon: true },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Next counsellor for a branch. Serialised per branch with an advisory lock so two enquiries
 * arriving together don't both go to the same person.
 */
export async function nextInRotation(tx: Tx, orgId: string, branchId: string): Promise<string | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead-rr:${branchId}`}))`;
  const users = await tx.user.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      deletedAt: null,
      branches: { some: { branchId } },
      roles: {
        some: {
          scope: { in: ["OWN", "ASSIGNED_BRANCHES"] },
          role: { deletedAt: null, permissions: { some: { permission: { key: "leads.receive" } } } },
        },
      },
    },
    select: { id: true, name: true },
  });
  if (users.length === 0) return null;
  const last = await tx.lead.groupBy({
    by: ["assignedToId"],
    where: { branchId, assignedToId: { in: users.map((u) => u.id) } },
    _max: { createdAt: true },
  });
  const lastBy = new Map(last.map((l) => [l.assignedToId, l._max.createdAt]));
  return pickRoundRobin(users.map((u) => ({ ...u, lastAssignedAt: lastBy.get(u.id) ?? null })));
}

/** People to tell about an unassigned lead: users at that branch who can assign leads. */
async function branchAssigners(tx: Tx, orgId: string, branchId: string) {
  const users = await tx.user.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      deletedAt: null,
      branches: { some: { branchId } },
      roles: { some: { role: { deletedAt: null, permissions: { some: { permission: { key: "leads.assign" } } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function assertAssignee(tx: Tx, orgId: string, branchId: string, userId: string) {
  const ok = await tx.user.findFirst({
    where: {
      id: userId,
      organizationId: orgId,
      isActive: true,
      deletedAt: null,
      OR: [
        { branches: { some: { branchId } } },
        { roles: { some: { scope: "ALL_BRANCHES", role: { deletedAt: null } } } },
      ],
      roles: { some: { role: { deletedAt: null, permissions: { some: { permission: { key: "leads.view" } } } } } },
    },
  });
  if (!ok) throw new ActionError("Pick someone who works with enquiries at this branch.");
}

async function loadLead(tx: Tx | typeof db, user: CurrentUser, id: string, permission: PermissionKey) {
  const lead = await tx.lead.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { status: true },
  });
  if (!lead) throw new ActionError("Enquiry not found.");
  if (!canAccessBranch(user.access, permission, lead.branchId))
    throw new ActionError("You can't work on enquiries of this branch.");
  if (scopeOf(user.access, permission) === "OWN" && lead.assignedToId !== user.id)
    throw new ActionError("This enquiry is assigned to someone else.");
  return lead;
}

const leadLink = (id: string) => `/admin/leads/${id}`;

// ------------------------------------------------------------------ intake (website + staff)

export type NewLead = {
  type: LeadType;
  branchId: string;
  sourceId: string;
  name: string;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  city?: string | null;
  courseId?: string | null;
  deviceTypeId?: string | null;
  deviceText?: string | null;
  problemText?: string | null;
  message?: string | null;
  assignedToId?: string | null;
  nextFollowUpAt?: Date | null;
};

/**
 * Create a lead, or add the enquiry to the open lead of the same type for this phone.
 * Returns the lead id and whether it was merged into an existing lead.
 */
export async function receiveLead(
  tx: Tx,
  actor: AuditActor,
  input: NewLead,
  opts: { createdByUserId: string | null; channel: string },
): Promise<{ id: string; merged: boolean }> {
  const orgId = actor.organizationId;
  const existing = await tx.lead.findFirst({
    where: {
      organizationId: orgId,
      phone: input.phone,
      type: input.type,
      deletedAt: null,
      status: { isWon: false, isLost: false },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const summary = [
      input.type === "COURSE" ? null : [input.deviceText, input.problemText].filter(Boolean).join(": "),
      input.message,
    ]
      .filter(Boolean)
      .join(" · ");
    await tx.lead.update({
      where: { id: existing.id },
      data: {
        enquiryCount: { increment: 1 },
        lastEnquiryAt: new Date(),
        // Fill gaps; never overwrite what staff already recorded.
        email: existing.email ?? input.email ?? null,
        city: existing.city ?? input.city ?? null,
        courseId: existing.courseId ?? input.courseId ?? null,
        deviceTypeId: existing.deviceTypeId ?? input.deviceTypeId ?? null,
      },
    });
    await tx.leadActivity.create({
      data: {
        leadId: existing.id,
        userId: opts.createdByUserId,
        kind: "ENQUIRY",
        note: `Enquired again (${opts.channel})${summary ? `: ${summary}` : ""}`.slice(0, 1000),
      },
    });
    const to = existing.assignedToId ? [existing.assignedToId] : await branchAssigners(tx, orgId, existing.branchId);
    await notify(
      tx,
      to.filter((u) => u !== opts.createdByUserId),
      {
        title: `${existing.name} enquired again`,
        body: `${LEAD_TYPE_LABELS[input.type]} enquiry via ${opts.channel}.`,
        link: leadLink(existing.id),
      },
    );
    return { id: existing.id, merged: true };
  }

  const status = await startingStatus(tx, orgId);
  const assignedToId = input.assignedToId ?? (await nextInRotation(tx, orgId, input.branchId));
  const lead = await tx.lead.create({
    data: {
      organizationId: orgId,
      branchId: input.branchId,
      type: input.type,
      sourceId: input.sourceId,
      statusId: status.id,
      assignedToId,
      name: input.name,
      phone: input.phone,
      altPhone: input.altPhone ?? null,
      email: input.email ?? null,
      city: input.city ?? null,
      courseId: input.courseId ?? null,
      deviceTypeId: input.deviceTypeId ?? null,
      deviceText: input.deviceText ?? null,
      problemText: input.problemText ?? null,
      message: input.message ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
    },
  });
  await writeAudit(tx, actor, {
    action: "CREATE",
    entityType: "Lead",
    entityId: lead.id,
    branchId: lead.branchId,
    after: lead,
  });
  if (assignedToId) {
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: opts.createdByUserId,
        kind: "ASSIGNMENT",
        note: input.assignedToId ? "Assigned on entry" : "Assigned automatically (round-robin)",
      },
    });
  }
  const to = assignedToId ? [assignedToId] : await branchAssigners(tx, orgId, input.branchId);
  await notify(
    tx,
    to.filter((u) => u !== opts.createdByUserId),
    {
      title: `New ${LEAD_TYPE_LABELS[input.type].toLowerCase()} enquiry: ${input.name}`,
      body: assignedToId ? `Assigned to you. Came in via ${opts.channel}.` : `Unassigned. Came in via ${opts.channel}.`,
      link: leadLink(lead.id),
    },
  );
  return { id: lead.id, merged: false };
}

export async function createLead(ctx: ActionContext, input: z.output<typeof leadSchema>) {
  const orgId = ctx.user.organizationId;
  if (!canAccessBranch(ctx.user.access, "leads.create", input.branchId))
    throw new ActionError("You can't add enquiries for this branch.");
  return db.$transaction(async (tx) => {
    await assertRefs(tx, orgId, input);
    if (input.assignedToId) {
      if (!canAccessBranch(ctx.user.access, "leads.assign", input.branchId))
        throw new ActionError("You can't assign enquiries.");
      await assertAssignee(tx, orgId, input.branchId, input.assignedToId);
    }
    const source = await tx.leadSource.findFirst({ where: { id: input.sourceId, organizationId: orgId } });
    return receiveLead(
      tx,
      ctx.actor,
      {
        ...input,
        nextFollowUpAt: input.nextFollowUpAt ? istLocalToDate(input.nextFollowUpAt) : null,
      },
      { createdByUserId: ctx.user.id, channel: source?.name.toLowerCase() ?? "staff" },
    );
  });
}

async function assertRefs(
  tx: Tx,
  orgId: string,
  input: { branchId: string; sourceId?: string; courseId?: string | null; deviceTypeId?: string | null },
) {
  const branch = await tx.branch.findFirst({
    where: { id: input.branchId, organizationId: orgId, deletedAt: null, isActive: true },
  });
  if (!branch) throw new ActionError("Branch not found.");
  if (input.sourceId) {
    const src = await tx.leadSource.findFirst({ where: { id: input.sourceId, organizationId: orgId } });
    if (!src) throw new ActionError("Lead source not found.");
  }
  if (input.courseId) {
    const c = await tx.course.findFirst({ where: { id: input.courseId, organizationId: orgId, deletedAt: null } });
    if (!c) throw new ActionError("Course not found.");
  }
  if (input.deviceTypeId) {
    const d = await tx.deviceType.findFirst({ where: { id: input.deviceTypeId, organizationId: orgId } });
    if (!d) throw new ActionError("Device type not found.");
  }
}

export async function updateLead(ctx: ActionContext, input: z.output<typeof leadSchema>) {
  if (!input.id) throw new ActionError("Enquiry not found.");
  const id = input.id;
  return db.$transaction(async (tx) => {
    const before = await loadLead(tx, ctx.user, id, "leads.update");
    if (input.branchId !== before.branchId && !canAccessBranch(ctx.user.access, "leads.update", input.branchId))
      throw new ActionError("You can't move enquiries to that branch.");
    await assertRefs(tx, ctx.user.organizationId, input);
    const after = await tx.lead.update({
      where: { id },
      data: {
        type: input.type,
        branchId: input.branchId,
        sourceId: input.sourceId,
        name: input.name,
        phone: input.phone,
        altPhone: input.altPhone,
        email: input.email,
        city: input.city,
        courseId: input.courseId,
        deviceTypeId: input.deviceTypeId,
        deviceText: input.deviceText,
        problemText: input.problemText,
        message: input.message,
        nextFollowUpAt: input.nextFollowUpAt ? istLocalToDate(input.nextFollowUpAt) : null,
      },
    });
    const { status: _s, ...plainBefore } = before;
    void _s;
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Lead",
      entityId: id,
      branchId: after.branchId,
      before: plainBefore,
      after,
    });
  });
}

// ------------------------------------------------------------------ follow-up work

export async function addActivity(ctx: ActionContext, input: z.output<typeof activitySchema>) {
  await db.$transaction(async (tx) => {
    const lead = await loadLead(tx, ctx.user, input.leadId, "leads.update");
    const followUp = input.nextFollowUpAt ? istLocalToDate(input.nextFollowUpAt) : null;
    await tx.leadActivity.create({
      data: { leadId: lead.id, userId: ctx.user.id, kind: input.kind, note: input.note, followUpAt: followUp },
    });
    if (followUp || input.clearFollowUp) {
      await tx.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: followUp } });
    }
  });
}

export async function changeLeadStatus(ctx: ActionContext, input: z.output<typeof statusChangeSchema>) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const lead = await loadLead(tx, ctx.user, input.leadId, "leads.update");
    const status = await tx.leadStatus.findFirst({
      where: { id: input.statusId, organizationId: orgId, isActive: true },
    });
    if (!status) throw new ActionError("Status not found.");
    if (status.id === lead.statusId) return;
    if (status.isLost && !input.lostReason) throw new ActionError("Give a reason the enquiry was lost.");
    if (status.isWon && !lead.enrollmentId && !lead.jobCardId && !can(ctx, "leads.convert"))
      throw new ActionError("You can't mark enquiries as won.");
    const after = await tx.lead.update({
      where: { id: lead.id },
      data: {
        statusId: status.id,
        lostReason: status.isLost ? input.lostReason : null,
        convertedAt: status.isWon ? (lead.convertedAt ?? new Date()) : null,
        // A closed lead needs no more follow-ups.
        ...(isOpenStatus(status) ? {} : { nextFollowUpAt: null }),
      },
    });
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: ctx.user.id,
        kind: "STATUS_CHANGE",
        note: [`${lead.status.name} → ${status.name}`, status.isLost ? input.lostReason : null, input.note]
          .filter(Boolean)
          .join(" · "),
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Lead",
      entityId: lead.id,
      branchId: lead.branchId,
      before: { statusId: lead.statusId, lostReason: lead.lostReason },
      after: { statusId: after.statusId, lostReason: after.lostReason },
    });
  });
}

const can = (ctx: ActionContext, p: PermissionKey) => scopeOf(ctx.user.access, p) !== null;

export async function assignLead(ctx: ActionContext, input: z.output<typeof assignLeadSchema>) {
  await db.$transaction(async (tx) => {
    const lead = await loadLead(tx, ctx.user, input.leadId, "leads.assign");
    if (lead.assignedToId === input.assignedToId) return;
    if (input.assignedToId) await assertAssignee(tx, ctx.user.organizationId, lead.branchId, input.assignedToId);
    await tx.lead.update({ where: { id: lead.id }, data: { assignedToId: input.assignedToId } });
    const name = input.assignedToId
      ? (await tx.user.findUnique({ where: { id: input.assignedToId }, select: { name: true } }))?.name
      : null;
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: ctx.user.id,
        kind: "ASSIGNMENT",
        note: name ? `Assigned to ${name}` : "Unassigned",
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Lead",
      entityId: lead.id,
      branchId: lead.branchId,
      before: { assignedToId: lead.assignedToId },
      after: { assignedToId: input.assignedToId },
    });
    if (input.assignedToId && input.assignedToId !== ctx.user.id) {
      await notify(tx, [input.assignedToId], {
        title: `Enquiry assigned to you: ${lead.name}`,
        body: `${ctx.user.name} assigned you a ${LEAD_TYPE_LABELS[lead.type].toLowerCase()} enquiry.`,
        link: leadLink(lead.id),
      });
    }
  });
}

export async function deleteLead(ctx: ActionContext, id: string, restore: boolean) {
  await db.$transaction(async (tx) => {
    const lead = await loadLead(tx, ctx.user, id, "leads.delete");
    await tx.lead.update({ where: { id }, data: { deletedAt: restore ? null : new Date() } });
    await writeAudit(tx, ctx.actor, {
      action: restore ? "RESTORE" : "DELETE",
      entityType: "Lead",
      entityId: id,
      branchId: lead.branchId,
    });
  });
}

// ------------------------------------------------------------------ conversion

/**
 * Called inside the admission / intake transaction. Converts `leadId` if given (the Convert button),
 * otherwise the newest open lead of that type for the phone. Marks it won and links the record.
 */
export async function convertLeadOnCreate(
  tx: Tx,
  ctx: ActionContext,
  opts: {
    type: LeadType;
    phone: string;
    leadId?: string | null;
    enrollmentId?: string;
    studentId?: string;
    jobCardId?: string;
    customerId?: string;
    label: string;
  },
) {
  const orgId = ctx.user.organizationId;
  const lead = opts.leadId
    ? await tx.lead.findFirst({
        where: { id: opts.leadId, organizationId: orgId, deletedAt: null },
        include: { status: true },
      })
    : await tx.lead.findFirst({
        where: {
          organizationId: orgId,
          phone: opts.phone,
          type: opts.type,
          deletedAt: null,
          status: { isWon: false, isLost: false },
        },
        include: { status: true },
        orderBy: { createdAt: "desc" },
      });
  if (!lead || lead.enrollmentId || lead.jobCardId) return null;
  if (opts.leadId && lead.type !== opts.type) throw new ActionError("That enquiry is for a different kind of service.");
  const won = await wonStatus(tx, orgId);
  await tx.lead.update({
    where: { id: lead.id },
    data: {
      statusId: won?.id ?? lead.statusId,
      convertedAt: new Date(),
      nextFollowUpAt: null,
      enrollmentId: opts.enrollmentId ?? null,
      jobCardId: opts.jobCardId ?? null,
    },
  });
  // Link the person to their first lead, if they don't have one yet.
  if (opts.studentId)
    await tx.student.updateMany({ where: { id: opts.studentId, leadId: null }, data: { leadId: lead.id } });
  if (opts.customerId)
    await tx.customer.updateMany({ where: { id: opts.customerId, leadId: null }, data: { leadId: lead.id } });
  await tx.leadActivity.create({
    data: { leadId: lead.id, userId: ctx.user.id, kind: "CONVERSION", note: opts.label },
  });
  await writeAudit(tx, ctx.actor, {
    action: "UPDATE",
    entityType: "Lead",
    entityId: lead.id,
    branchId: lead.branchId,
    before: { statusId: lead.statusId },
    after: { statusId: won?.id ?? lead.statusId, enrollmentId: opts.enrollmentId, jobCardId: opts.jobCardId },
  });
  if (lead.assignedToId && lead.assignedToId !== ctx.user.id) {
    await notify(tx, [lead.assignedToId], {
      title: `Converted: ${lead.name}`,
      body: opts.label,
      link: leadLink(lead.id),
    });
  }
  return lead.id;
}
