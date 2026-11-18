import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { conversionReport, type ReportLead } from "./lead-logic";

const DAY = 86_400_000;

/** Start of today and of tomorrow in IST, as instants. */
export function istTodayBounds(now = new Date()) {
  const start = new Date(istDateOnly(now).getTime() - 330 * 60_000);
  return { start, end: new Date(start.getTime() + DAY) };
}

/** Leads the user may see: branch scope; OWN scope = only leads assigned to them. */
export function leadScopeWhere(user: CurrentUser, activeBranchId: string | null): Prisma.LeadWhereInput {
  const c = branchConstraint(user.access, "leads.view", activeBranchId);
  return {
    organizationId: user.organizationId,
    ...(c.branchIds ? { branchId: { in: c.branchIds } } : {}),
    ...(c.ownOnly ? { assignedToId: user.id } : {}),
  };
}

const OPEN: Prisma.LeadWhereInput = { status: { isWon: false, isLost: false } };

export async function listLeads(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const f = p.filters;
  const { start, end } = istTodayBounds();
  const state = f.state ?? "open";
  const where: Prisma.LeadWhereInput = {
    ...leadScopeWhere(user, activeBranchId),
    deletedAt: p.showDeleted ? { not: null } : null,
    ...(state === "open"
      ? OPEN
      : state === "won"
        ? { status: { isWon: true } }
        : state === "lost"
          ? { status: { isLost: true } }
          : {}),
    ...(f.status ? { statusId: f.status } : {}),
    ...(f.type ? { type: f.type as never } : {}),
    ...(f.source ? { sourceId: f.source } : {}),
    ...(f.course ? { courseId: f.course } : {}),
    ...(f.assignee === "me"
      ? { assignedToId: user.id }
      : f.assignee === "none"
        ? { assignedToId: null }
        : f.assignee
          ? { assignedToId: f.assignee }
          : {}),
    ...(f.follow === "overdue"
      ? { nextFollowUpAt: { lt: start } }
      : f.follow === "today"
        ? { nextFollowUpAt: { gte: start, lt: end } }
        : f.follow === "due"
          ? { nextFollowUpAt: { lt: end } }
          : {}),
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" } },
            { phone: { contains: p.q.replace(/\D/g, "") || p.q } },
            { email: { contains: p.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    p.sort === "name"
      ? [{ name: p.dir }]
      : p.sort === "followUp"
        ? [{ nextFollowUpAt: { sort: p.dir, nulls: "last" } }]
        : [{ lastEnquiryAt: "desc" }];
  const [rows, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy,
      ...paging(p),
      include: {
        status: { select: { name: true, color: true, isWon: true, isLost: true } },
        source: { select: { name: true } },
        assignedTo: { select: { name: true } },
        branch: { select: { code: true } },
        course: { select: { name: true } },
        deviceType: { select: { name: true } },
      },
    }),
    db.lead.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      type: l.type,
      interest:
        l.type === "COURSE"
          ? (l.course?.name ?? "Course (not chosen)")
          : [l.deviceText ?? l.deviceType?.name, l.problemText].filter(Boolean).join(" · "),
      status: l.status.name,
      statusTone: l.status.color,
      source: l.source.name,
      assignee: l.assignedTo?.name ?? null,
      branchCode: l.branch.code,
      nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
      overdue: !!l.nextFollowUpAt && l.nextFollowUpAt < start,
      dueToday: !!l.nextFollowUpAt && l.nextFollowUpAt >= start && l.nextFollowUpAt < end,
      enquiryCount: l.enquiryCount,
      createdAt: l.createdAt.toISOString(),
      deleted: !!l.deletedAt,
    })),
  };
}
export type LeadRow = Awaited<ReturnType<typeof listLeads>>["rows"][number];

export async function getLead(user: CurrentUser, id: string) {
  const lead = await db.lead.findFirst({
    where: { id, ...leadScopeWhere(user, null) },
    include: {
      status: true,
      source: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
      course: { select: { id: true, name: true } },
      deviceType: { select: { id: true, name: true } },
      enrollment: { select: { id: true, studentId: true, course: { select: { name: true } } } },
      jobCard: { select: { id: true, jobNo: true } },
      activities: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } }, take: 200 },
    },
  });
  if (!lead) return null;
  const { start } = istTodayBounds();
  // Earlier enquiries from the same phone (any type), so staff see the history.
  const others = await db.lead.findMany({
    where: { organizationId: user.organizationId, phone: lead.phone, id: { not: lead.id }, deletedAt: null },
    select: { id: true, type: true, createdAt: true, status: { select: { name: true, color: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const [student, customer] = await Promise.all([
    db.student.findFirst({
      where: { organizationId: user.organizationId, phone: lead.phone, deletedAt: null },
      select: { id: true, name: true, studentCode: true },
    }),
    db.customer.findFirst({
      where: { organizationId: user.organizationId, phone: lead.phone, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);
  return {
    ...lead,
    overdue: !!lead.nextFollowUpAt && lead.nextFollowUpAt < start,
    isOpen: !lead.status.isWon && !lead.status.isLost,
    others,
    student,
    customer,
    canEdit: canAccessBranch(user.access, "leads.update", lead.branchId),
    canAssign: canAccessBranch(user.access, "leads.assign", lead.branchId),
    canConvert: canAccessBranch(user.access, "leads.convert", lead.branchId),
    canDelete: canAccessBranch(user.access, "leads.delete", lead.branchId),
  };
}
export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

/** Everything the lead forms need. */
export async function leadFormOptions(user: CurrentUser, branchIds: string[]) {
  const orgId = user.organizationId;
  const [sources, statuses, courses, deviceTypes, assignees] = await Promise.all([
    db.leadSource.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.leadStatus.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.course.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.deviceType.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { sortOrder: "asc" } }),
    leadAssignees(orgId, branchIds),
  ]);
  return {
    sources: sources.map((s) => ({ value: s.id, label: s.name })),
    statuses: statuses.map((s) => ({ value: s.id, label: s.name, tone: s.color, isWon: s.isWon, isLost: s.isLost })),
    courses: courses.map((c) => ({ value: c.id, label: c.name })),
    deviceTypes: deviceTypes.map((d) => ({ value: d.id, label: d.name })),
    assignees,
  };
}

/** Users who can work leads, with the branches they're assigned to (to filter per branch in forms). */
export async function leadAssignees(orgId: string, branchIds: string[]) {
  const users = await db.user.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      deletedAt: null,
      roles: { some: { role: { deletedAt: null, permissions: { some: { permission: { key: "leads.view" } } } } } },
      OR: [{ branches: { some: { branchId: { in: branchIds } } } }, { roles: { some: { scope: "ALL_BRANCHES" } } }],
    },
    select: {
      id: true,
      name: true,
      branches: { select: { branchId: true } },
      roles: { select: { scope: true } },
    },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    value: u.id,
    label: u.name,
    branchIds: u.roles.some((r) => r.scope === "ALL_BRANCHES") ? null : u.branches.map((b) => b.branchId),
  }));
}

/** Follow-ups due (overdue + today) for the bell and the dashboard. */
export async function followUpCounts(user: CurrentUser) {
  const { start, end } = istTodayBounds();
  const mine = scopeOf(user.access, "leads.view") === "OWN" || !user.access.permissions.has("leads.assign");
  const where: Prisma.LeadWhereInput = {
    ...leadScopeWhere(user, null),
    ...OPEN,
    deletedAt: null,
    ...(mine ? { assignedToId: user.id } : {}),
  };
  const [overdue, today] = await Promise.all([
    db.lead.count({ where: { ...where, nextFollowUpAt: { lt: start } } }),
    db.lead.count({ where: { ...where, nextFollowUpAt: { gte: start, lt: end } } }),
  ]);
  return { overdue, today, mine };
}

/** Conversion report: leads created in the date range, by source and by counsellor. */
export async function leadReport(
  user: CurrentUser,
  opts: { from: Date; to: Date; type: "COURSE" | "SERVICE" | null; activeBranchId: string | null },
) {
  const leads = await db.lead.findMany({
    where: {
      ...leadScopeWhere(user, opts.activeBranchId),
      deletedAt: null,
      createdAt: { gte: opts.from, lt: opts.to },
      ...(opts.type ? { type: opts.type } : {}),
    },
    select: {
      sourceId: true,
      assignedToId: true,
      source: { select: { name: true } },
      assignedTo: { select: { name: true } },
      status: { select: { isWon: true, isLost: true } },
    },
  });
  const rows: ReportLead[] = leads.map((l) => ({
    sourceId: l.sourceId,
    sourceName: l.source.name,
    assigneeId: l.assignedToId,
    assigneeName: l.assignedTo?.name ?? null,
    isWon: l.status.isWon,
    isLost: l.status.isLost,
  }));
  return {
    bySource: conversionReport(rows, "source"),
    byAssignee: conversionReport(rows, "assignee"),
    total: rows.length,
    won: rows.filter((r) => r.isWon).length,
    lost: rows.filter((r) => r.isLost).length,
  };
}

/** Prefill data for the admission / intake form when converting a lead. */
export async function leadForConversion(user: CurrentUser, id: string, type: "COURSE" | "SERVICE") {
  const lead = await db.lead.findFirst({
    where: { id, type, deletedAt: null, enrollmentId: null, jobCardId: null, ...leadScopeWhere(user, null) },
    select: {
      id: true,
      name: true,
      phone: true,
      altPhone: true,
      email: true,
      city: true,
      branchId: true,
      courseId: true,
      deviceTypeId: true,
      deviceText: true,
      problemText: true,
    },
  });
  if (!lead || !canAccessBranch(user.access, "leads.convert", lead.branchId)) return null;
  return lead;
}
