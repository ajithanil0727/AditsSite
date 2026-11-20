import "server-only";
import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { writeAudit } from "@/modules/audit/audit.service";
import { canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { revalidateSite } from "@/modules/website/site.data";
import type {
  addApplicantsSchema,
  applicationStatusSchema,
  companySchema,
  driveSchema,
  offerSchema,
  roundSchema,
} from "./placements.schemas";

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const dec = (n: number | null) => (n === null ? null : String(n));

// ------------------------------------------------------------------ companies (organisation-wide)

export async function saveCompany(ctx: ActionContext, input: z.output<typeof companySchema>) {
  const orgId = ctx.user.organizationId;
  const id = await db.$transaction(async (tx) => {
    const data = {
      name: input.name,
      industry: input.industry,
      website: input.website,
      city: input.city,
      address: input.address,
      isActive: input.isActive,
    };
    const dup = await tx.company.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
        name: { equals: input.name, mode: "insensitive" },
        ...(input.id ? { id: { not: input.id } } : {}),
      },
    });
    if (dup) throw new ActionError("A company with this name already exists.");
    if (input.id) {
      const before = await tx.company.findFirst({
        where: { id: input.id, organizationId: orgId, deletedAt: null },
        include: { contacts: true },
      });
      if (!before) throw new ActionError("Company not found.");
      await tx.company.update({ where: { id: before.id }, data });
      await tx.companyContact.deleteMany({ where: { companyId: before.id } });
      if (input.contacts.length)
        await tx.companyContact.createMany({ data: input.contacts.map((c) => ({ ...c, companyId: before.id })) });
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "Company",
        entityId: before.id,
        before,
        after: { ...data, contacts: input.contacts },
      });
      return before.id;
    }
    const created = await tx.company.create({
      data: { ...data, organizationId: orgId, contacts: { create: input.contacts } },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Company",
      entityId: created.id,
      after: { ...data, contacts: input.contacts },
    });
    return created.id;
  });
  revalidateSite();
  return id;
}

// ------------------------------------------------------------------ drives

/** A drive for every branch needs all-branch access; otherwise the branch must be one of yours. */
function assertDriveBranch(ctx: ActionContext, branchId: string | null) {
  if (branchId === null) {
    if (scopeOf(ctx.user.access, "placements.manage_drives") !== "ALL_BRANCHES")
      throw new ActionError(
        "Only people who work across all branches can open a drive for every branch. Pick a branch.",
      );
  } else if (!canAccessBranch(ctx.user.access, "placements.manage_drives", branchId)) {
    throw new ActionError("You can't manage drives for this branch.");
  }
}

export async function saveDrive(ctx: ActionContext, input: z.output<typeof driveSchema>) {
  const orgId = ctx.user.organizationId;
  assertDriveBranch(ctx, input.branchId);
  return db.$transaction(async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: input.companyId, organizationId: orgId, deletedAt: null },
    });
    if (!company) throw new ActionError("Pick a company.");
    if (
      input.branchId &&
      !(await tx.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } }))
    )
      throw new ActionError("Branch not found.");
    const courses = await tx.course.count({ where: { id: { in: input.courseIds }, organizationId: orgId } });
    if (courses !== input.courseIds.length) throw new ActionError("A selected course doesn't exist.");
    const data = {
      companyId: company.id,
      branchId: input.branchId,
      title: input.title,
      jobRole: input.jobRole,
      description: input.description,
      location: input.location,
      salaryMin: dec(input.salaryMin),
      salaryMax: dec(input.salaryMax),
      driveDate: input.driveDate ? dateOnly(input.driveDate) : null,
      lastDateToApply: input.lastDateToApply ? dateOnly(input.lastDateToApply) : null,
      status: input.status,
    };
    if (input.id) {
      const before = await tx.placementDrive.findFirst({
        where: { id: input.id, organizationId: orgId, deletedAt: null },
        include: { courses: true },
      });
      if (!before) throw new ActionError("Drive not found.");
      assertDriveBranch(ctx, before.branchId);
      await tx.placementDrive.update({ where: { id: before.id }, data });
      await tx.placementDriveCourse.deleteMany({ where: { driveId: before.id } });
      await tx.placementDriveCourse.createMany({
        data: input.courseIds.map((courseId) => ({ driveId: before.id, courseId })),
      });
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "PlacementDrive",
        entityId: before.id,
        branchId: before.branchId,
        before,
        after: { ...data, courseIds: input.courseIds },
      });
      return before.id;
    }
    const created = await tx.placementDrive.create({
      data: {
        ...data,
        organizationId: orgId,
        createdById: ctx.user.id,
        courses: { create: input.courseIds.map((courseId) => ({ courseId })) },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "PlacementDrive",
      entityId: created.id,
      branchId: created.branchId,
      after: created,
    });
    return created.id;
  });
}

export async function deleteDrive(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const d = await tx.placementDrive.findFirst({
      where: { id, organizationId: ctx.user.organizationId, deletedAt: null },
      include: { _count: { select: { applications: true } } },
    });
    if (!d) throw new ActionError("Drive not found.");
    assertDriveBranch(ctx, d.branchId);
    if (d._count.applications) throw new ActionError("Students have applied to this drive. Cancel it instead.");
    await tx.placementDrive.update({ where: { id: d.id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, ctx.actor, {
      action: "DELETE",
      entityType: "PlacementDrive",
      entityId: d.id,
      branchId: d.branchId,
      before: { title: d.title },
    });
  });
}

// ------------------------------------------------------------------ applications

/**
 * Who can be put forward for a drive: enrolled (not dropped) in one of the drive's courses (any course if none),
 * at the drive's branch (any branch if none), not opted out of placement, not already in this drive.
 */
export function eligibleEnrollmentWhere(drive: {
  organizationId: string;
  branchId: string | null;
  courses: { courseId: string }[];
}) {
  return {
    organizationId: drive.organizationId,
    deletedAt: null,
    status: { in: ["ACTIVE" as const, "ON_HOLD" as const, "COMPLETED" as const] },
    placementOptOut: false,
    ...(drive.branchId ? { branchId: drive.branchId } : {}),
    ...(drive.courses.length ? { courseId: { in: drive.courses.map((c) => c.courseId) } } : {}),
  };
}

async function loadApplication(tx: Tx, ctx: ActionContext, id: string) {
  const a = await tx.placementApplication.findFirst({
    where: { id, drive: { organizationId: ctx.user.organizationId } },
    include: { drive: true, enrollment: true, student: true, offer: true },
  });
  if (!a) throw new ActionError("Application not found.");
  const branchId = a.enrollment?.branchId ?? a.student.branchId;
  if (!canAccessBranch(ctx.user.access, "placements.manage_applications", branchId))
    throw new ActionError("This student belongs to a branch you can't access.");
  return { ...a, branchId };
}

export async function addApplicants(ctx: ActionContext, input: z.output<typeof addApplicantsSchema>) {
  return db.$transaction(async (tx) => {
    const drive = await tx.placementDrive.findFirst({
      where: { id: input.driveId, organizationId: ctx.user.organizationId, deletedAt: null },
      include: { courses: true, applications: { select: { studentId: true } } },
    });
    if (!drive) throw new ActionError("Drive not found.");
    if (drive.status !== "OPEN") throw new ActionError("This drive isn't open.");
    const enrollments = await tx.enrollment.findMany({
      where: { id: { in: input.enrollmentIds }, ...eligibleEnrollmentWhere(drive) },
    });
    if (enrollments.length !== input.enrollmentIds.length)
      throw new ActionError("Someone in the list can't be put forward for this drive.");
    const already = new Set(drive.applications.map((a) => a.studentId));
    let added = 0;
    for (const e of enrollments) {
      if (!canAccessBranch(ctx.user.access, "placements.manage_applications", e.branchId))
        throw new ActionError("A student belongs to a branch you can't access.");
      if (already.has(e.studentId)) continue;
      already.add(e.studentId);
      await tx.placementApplication.create({ data: { driveId: drive.id, studentId: e.studentId, enrollmentId: e.id } });
      added++;
    }
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "PlacementApplication",
      entityId: drive.id,
      branchId: drive.branchId,
      after: { drive: drive.title, added },
    });
    return added;
  });
}

export async function setApplicationStatus(ctx: ActionContext, input: z.output<typeof applicationStatusSchema>) {
  await db.$transaction(async (tx) => {
    const a = await loadApplication(tx, ctx, input.id);
    if (a.offer && input.status !== "SELECTED")
      throw new ActionError("This student has an offer. Remove the offer first.");
    if (input.status === "SELECTED" && !a.offer) throw new ActionError("Record the offer to mark someone selected.");
    await tx.placementApplication.update({ where: { id: a.id }, data: { status: input.status, notes: input.notes } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "PlacementApplication",
      entityId: a.id,
      branchId: a.branchId,
      before: { status: a.status, notes: a.notes },
      after: { status: input.status, notes: input.notes },
    });
  });
}

export async function saveRound(ctx: ActionContext, input: z.output<typeof roundSchema>) {
  await db.$transaction(async (tx) => {
    const a = await loadApplication(tx, ctx, input.applicationId);
    const data = {
      name: input.name,
      scheduledAt: input.scheduledAt ? dateOnly(input.scheduledAt) : null,
      result: input.result,
      remarks: input.remarks,
    };
    if (input.id) {
      const before = await tx.interviewRound.findFirst({ where: { id: input.id, applicationId: a.id } });
      if (!before) throw new ActionError("Round not found.");
      await tx.interviewRound.update({ where: { id: before.id }, data });
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "InterviewRound",
        entityId: before.id,
        branchId: a.branchId,
        before,
        after: data,
      });
    } else {
      const roundNo = (await tx.interviewRound.count({ where: { applicationId: a.id } })) + 1;
      const r = await tx.interviewRound.create({ data: { ...data, applicationId: a.id, roundNo } });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "InterviewRound",
        entityId: r.id,
        branchId: a.branchId,
        after: r,
      });
    }
    // A failed / missed round ends it; any round moves an applied/shortlisted student to "interviewing".
    if (!a.offer) {
      const status =
        input.result === "FAILED" || input.result === "NO_SHOW"
          ? "REJECTED"
          : a.status === "APPLIED" || a.status === "SHORTLISTED"
            ? "IN_PROCESS"
            : a.status;
      if (status !== a.status) await tx.placementApplication.update({ where: { id: a.id }, data: { status } });
    }
  });
}

/** Records (or corrects) the offer; the application becomes "selected". Placed = offer not declined. */
export async function saveOffer(ctx: ActionContext, input: z.output<typeof offerSchema>) {
  if (input.offeredAt > istDateOnly(new Date()).toISOString().slice(0, 10))
    throw new ActionError("The offer date can't be in the future.");
  if (input.joiningStatus === "JOINED" && !input.joiningDate) throw new ActionError("Enter the joining date.");
  await db.$transaction(async (tx) => {
    const a = await loadApplication(tx, ctx, input.applicationId);
    if (a.drive.status === "CANCELLED") throw new ActionError("This drive was cancelled.");
    const data = {
      offeredAt: dateOnly(input.offeredAt),
      designation: input.designation,
      ctcAnnual: dec(input.ctcAnnual),
      joiningDate: input.joiningDate ? dateOnly(input.joiningDate) : null,
      joiningStatus: input.joiningStatus,
    };
    await tx.placementOffer.upsert({
      where: { applicationId: a.id },
      create: { ...data, applicationId: a.id },
      update: data,
    });
    await tx.placementApplication.update({ where: { id: a.id }, data: { status: "SELECTED" } });
    await writeAudit(tx, ctx.actor, {
      action: a.offer ? "UPDATE" : "CREATE",
      entityType: "PlacementOffer",
      entityId: a.id,
      branchId: a.branchId,
      before: a.offer ?? undefined,
      after: data,
    });
  });
  revalidateSite();
}

export async function deleteOffer(ctx: ActionContext, applicationId: string) {
  await db.$transaction(async (tx) => {
    const a = await loadApplication(tx, ctx, applicationId);
    if (!a.offer) throw new ActionError("There's no offer.");
    await tx.placementOffer.delete({ where: { applicationId: a.id } });
    await tx.placementApplication.update({ where: { id: a.id }, data: { status: "IN_PROCESS" } });
    await writeAudit(tx, ctx.actor, {
      action: "DELETE",
      entityType: "PlacementOffer",
      entityId: a.id,
      branchId: a.branchId,
      before: a.offer,
    });
  });
  revalidateSite();
}
