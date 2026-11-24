import "server-only";
import type { JobStatusKey } from "@/generated/prisma/enums";
import { db, type Tx } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import { writeAudit } from "@/modules/audit/audit.service";
import { notify } from "@/modules/notifications/notifications.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { OPEN_KEYS } from "./workflow";

/**
 * The shelf (2026-11-24): jobs without an engineer. Engineers with jobcards.self_assign take them for themselves
 * (first come, first served) and may put their own job back. The Service Manager can still assign as before.
 * Front office doesn't assign. Alerts: new job on the shelf → branch engineers; assigned → that engineer;
 * taken / returned → the branch's assigners.
 */

/** Statuses an engineer may still hand back (not once the repair is done). */
const RETURNABLE: JobStatusKey[] = OPEN_KEYS.filter((k) => k !== "READY" && k !== "QC");

const deviceLabel = (d: {
  modelText: string | null;
  brand: { name: string } | null;
  model: { name: string } | null;
  deviceType: { name: string };
}) => [d.brand?.name, d.model?.name ?? d.modelText].filter(Boolean).join(" ") || d.deviceType.name;

/** Users at the branch whose role grants `permission` for that branch (not all-branch roles like owners: too noisy). */
async function branchUsersWith(
  tx: Tx | typeof db,
  orgId: string,
  branchId: string,
  permission: PermissionKey,
  except?: string,
) {
  const rows = await tx.user.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      deletedAt: null,
      branches: { some: { branchId } },
      roles: {
        some: {
          scope: { not: "ALL_BRANCHES" },
          role: { deletedAt: null, permissions: { some: { permission: { key: permission } } } },
        },
      },
      ...(except ? { id: { not: except } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function jobForShelf(tx: Tx, orgId: string, jobId: string) {
  const job = await tx.jobCard.findFirst({
    where: { id: jobId, organizationId: orgId, deletedAt: null },
    include: {
      status: { select: { systemKey: true } },
      device: {
        select: {
          modelText: true,
          brand: { select: { name: true } },
          model: { select: { name: true } },
          deviceType: { select: { name: true } },
        },
      },
    },
  });
  if (!job) throw new ActionError("Job card not found.");
  return job;
}

/** Tell the branch's engineers a job is waiting on the shelf (new intake without an engineer, or handed back). */
export async function announceOnShelf(
  tx: Tx,
  job: {
    organizationId: string;
    branchId: string;
    jobNo: string;
    problemReported: string;
    device: Parameters<typeof deviceLabel>[0];
  },
  opts: { except?: string; returned?: boolean } = {},
) {
  const engineers = await branchUsersWith(tx, job.organizationId, job.branchId, "jobcards.self_assign", opts.except);
  await notify(tx, engineers, {
    title: opts.returned ? `Job ${job.jobNo} is back on the shelf` : `New job on the shelf: ${job.jobNo}`,
    body: `${deviceLabel(job.device)} · ${job.problemReported}`.slice(0, 300),
    link: "/admin/service/shelf",
  });
}

/** Tell an engineer a job was given to them (manager assignment). */
export async function announceAssigned(
  tx: Tx,
  job: { id: string; jobNo: string; problemReported: string; device: Parameters<typeof deviceLabel>[0] },
  engineerId: string,
  byUserId: string,
) {
  if (engineerId === byUserId) return;
  await notify(tx, [engineerId], {
    title: `Job ${job.jobNo} assigned to you`,
    body: `${deviceLabel(job.device)} · ${job.problemReported}`.slice(0, 300),
    link: `/admin/service/jobs/${job.id}`,
  });
}

/** Engineer takes an unassigned job from the shelf. Atomic: if two click at once, only one gets it. */
export async function takeJob(ctx: ActionContext, jobId: string) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const job = await jobForShelf(tx, orgId, jobId);
    if (!canAccessBranch(ctx.user.access, "jobcards.self_assign", job.branchId))
      throw new ActionError("This job is at a branch you don't work in.");
    if (!OPEN_KEYS.includes(job.status.systemKey)) throw new ActionError("This job is closed.");
    const taken = await tx.jobCard.updateMany({
      where: { id: job.id, assignedEngineerId: null, deletedAt: null },
      data: { assignedEngineerId: ctx.user.id },
    });
    if (taken.count === 0) {
      const now = await tx.jobCard.findUnique({
        where: { id: job.id },
        select: { assignedEngineer: { select: { name: true } } },
      });
      throw new ActionError(`Already taken by ${now?.assignedEngineer?.name ?? "someone else"}.`);
    }
    await tx.jobNote.create({
      data: {
        jobCardId: job.id,
        userId: ctx.user.id,
        note: `Taken from the shelf by ${ctx.user.name}.`,
        isInternal: true,
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "JobCard",
      entityId: job.id,
      branchId: job.branchId,
      before: { assignedEngineerId: null },
      after: { assignedEngineerId: ctx.user.id, via: "shelf" },
    });
    await notify(tx, await branchUsersWith(tx, orgId, job.branchId, "jobcards.assign", ctx.user.id), {
      title: `${ctx.user.name} took job ${job.jobNo}`,
      body: `${deviceLabel(job.device)} · ${job.problemReported}`.slice(0, 300),
      link: `/admin/service/jobs/${job.id}`,
    });
  });
}

/** Engineer puts their own job back on the shelf (before it's repaired). */
export async function returnJob(ctx: ActionContext, jobId: string, reason: string | null) {
  const orgId = ctx.user.organizationId;
  return db.$transaction(async (tx) => {
    const job = await jobForShelf(tx, orgId, jobId);
    if (!canAccessBranch(ctx.user.access, "jobcards.self_assign", job.branchId))
      throw new ActionError("This job is at a branch you don't work in.");
    if (job.assignedEngineerId !== ctx.user.id) throw new ActionError("You can only return your own jobs.");
    if (!RETURNABLE.includes(job.status.systemKey))
      throw new ActionError("This job is already repaired. Ask the service manager to change it.");
    await tx.jobCard.update({ where: { id: job.id }, data: { assignedEngineerId: null } });
    await tx.jobNote.create({
      data: {
        jobCardId: job.id,
        userId: ctx.user.id,
        note: `Returned to the shelf by ${ctx.user.name}${reason ? `: ${reason}` : "."}`,
        isInternal: true,
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "JobCard",
      entityId: job.id,
      branchId: job.branchId,
      before: { assignedEngineerId: ctx.user.id },
      after: { assignedEngineerId: null, via: "shelf", reason },
    });
    await notify(tx, await branchUsersWith(tx, orgId, job.branchId, "jobcards.assign", ctx.user.id), {
      title: `${ctx.user.name} returned job ${job.jobNo} to the shelf`,
      body: reason ?? deviceLabel(job.device),
      link: `/admin/service/jobs/${job.id}`,
    });
    await announceOnShelf(tx, job, { except: ctx.user.id, returned: true });
    return job.jobNo;
  });
}
