import "server-only";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { writeAudit } from "@/modules/audit/audit.service";
import { attendancePercent, instalmentDue } from "@/modules/fees/fee-logic";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { rupeesToPaise } from "@/modules/tax/gst";
import { revalidateSite } from "@/modules/website/site.data";
import {
  certificateEligibility,
  DEFAULT_CERTIFICATE_RULES,
  makeVerifyCode,
  validateRules,
  type CertificateRules,
} from "./academic-logic";
import {
  CERTIFICATE_RULES_KEY,
  type assessmentSchema,
  type certificateRulesSchema,
  type issueCertificateSchema,
  type marksSchema,
  type placementOptOutSchema,
  type revokeCertificateSchema,
} from "./academics.schemas";

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const todayYmd = () => istDateOnly(new Date()).toISOString().slice(0, 10);

// ------------------------------------------------------------------ rules (Setting "certificates")

export async function getCertificateRules(orgId: string, tx: Tx | typeof db = db): Promise<CertificateRules> {
  const row = await tx.setting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: CERTIFICATE_RULES_KEY } },
  });
  const v = (row?.value ?? {}) as Partial<CertificateRules>;
  return {
    minAttendance: v.minAttendance ?? DEFAULT_CERTIFICATE_RULES.minAttendance,
    passPercent: v.passPercent ?? DEFAULT_CERTIFICATE_RULES.passPercent,
    grades: v.grades?.length ? v.grades : DEFAULT_CERTIFICATE_RULES.grades,
  };
}

export async function saveCertificateRules(ctx: ActionContext, input: z.output<typeof certificateRulesSchema>) {
  const rules: CertificateRules = { ...input, grades: [...input.grades].sort((a, b) => b.min - a.min) };
  const problem = validateRules(rules);
  if (problem) throw new ActionError(problem);
  const orgId = ctx.user.organizationId;
  const before = await getCertificateRules(orgId);
  await db.setting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: CERTIFICATE_RULES_KEY } },
    create: { organizationId: orgId, key: CERTIFICATE_RULES_KEY, value: rules as unknown as Prisma.InputJsonValue },
    update: { value: rules as unknown as Prisma.InputJsonValue },
  });
  await writeAudit(db, ctx.actor, {
    action: "UPDATE",
    entityType: "Setting",
    entityId: CERTIFICATE_RULES_KEY,
    before,
    after: rules,
  });
}

// ------------------------------------------------------------------ assessments

async function loadBatch(tx: Tx, ctx: ActionContext, batchId: string) {
  const batch = await tx.batch.findFirst({
    where: { id: batchId, organizationId: ctx.user.organizationId, deletedAt: null },
  });
  if (!batch) throw new ActionError("Batch not found.");
  return batch;
}

/** Trainers (OWN scope) only work on their own batches. */
function assertBatchAccess(
  ctx: ActionContext,
  permission: "assessments.manage" | "assessments.enter_marks",
  batch: { branchId: string; trainerId: string | null },
) {
  if (!canAccessBranch(ctx.user.access, permission, batch.branchId)) throw new ActionError("Not your branch.");
  if (scopeOf(ctx.user.access, permission) === "OWN" && batch.trainerId !== ctx.user.id)
    throw new ActionError("You can only work on your own batches.");
}

export async function saveAssessment(ctx: ActionContext, input: z.output<typeof assessmentSchema>) {
  return db.$transaction(async (tx) => {
    const batch = await loadBatch(tx, ctx, input.batchId);
    assertBatchAccess(ctx, "assessments.manage", batch);
    const type = await tx.assessmentType.findFirst({
      where: { id: input.typeId, organizationId: ctx.user.organizationId, isActive: true },
    });
    if (!type) throw new ActionError("Pick an assessment type.");
    const data = {
      typeId: type.id,
      title: input.title,
      date: dateOnly(input.date),
      maxMarks: String(input.maxMarks),
      passMarks: String(input.passMarks),
    };
    if (input.id) {
      const before = await tx.assessment.findFirst({
        where: { id: input.id, batchId: batch.id, deletedAt: null },
        include: { results: true },
      });
      if (!before) throw new ActionError("Assessment not found.");
      const top = Math.max(0, ...before.results.map((r) => Number(r.marks ?? 0)));
      if (input.maxMarks < top) throw new ActionError(`Someone already has ${top} marks; the maximum can't be lower.`);
      const after = await tx.assessment.update({ where: { id: before.id }, data });
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "Assessment",
        entityId: after.id,
        branchId: batch.branchId,
        before,
        after,
      });
      return after.id;
    }
    const created = await tx.assessment.create({ data: { ...data, batchId: batch.id, createdById: ctx.user.id } });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Assessment",
      entityId: created.id,
      branchId: batch.branchId,
      after: created,
    });
    return created.id;
  });
}

export async function deleteAssessment(ctx: ActionContext, id: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.assessment.findFirst({
      where: { id, deletedAt: null, batch: { organizationId: ctx.user.organizationId } },
      include: { batch: true, results: { select: { enrollmentId: true } } },
    });
    if (!a) throw new ActionError("Assessment not found.");
    assertBatchAccess(ctx, "assessments.manage", a.batch);
    const certified = await tx.certificate.count({
      where: { enrollmentId: { in: a.results.map((r) => r.enrollmentId) }, status: "ISSUED" },
    });
    if (certified) throw new ActionError("Some students already have certificates based on these marks.");
    await tx.assessment.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    await writeAudit(tx, ctx.actor, {
      action: "DELETE",
      entityType: "Assessment",
      entityId: a.id,
      branchId: a.batch.branchId,
      before: { title: a.title },
    });
    return a.batchId;
  });
}

/** Enter or correct marks. Blank + not absent = not entered. Marks are frozen once a certificate is issued. */
export async function saveMarks(ctx: ActionContext, input: z.output<typeof marksSchema>) {
  await db.$transaction(async (tx) => {
    const a = await tx.assessment.findFirst({
      where: { id: input.assessmentId, deletedAt: null, batch: { organizationId: ctx.user.organizationId } },
      include: { batch: true, results: true },
    });
    if (!a) throw new ActionError("Assessment not found.");
    assertBatchAccess(ctx, "assessments.enter_marks", a.batch);
    if (a.date.toISOString().slice(0, 10) > todayYmd()) throw new ActionError("This assessment hasn't happened yet.");
    const max = Number(a.maxMarks);
    // Students currently in the batch, plus anyone who already has a result here (moved batch later).
    const allowed = new Set([
      ...(
        await tx.enrollment.findMany({
          where: { batchId: a.batchId, deletedAt: null, status: { not: "DROPPED" } },
          select: { id: true },
        })
      ).map((e) => e.id),
      ...a.results.map((r) => r.enrollmentId),
    ]);
    const certified = new Set(
      (
        await tx.certificate.findMany({
          where: { enrollmentId: { in: input.rows.map((r) => r.enrollmentId) }, status: "ISSUED" },
          select: { enrollmentId: true },
        })
      ).map((c) => c.enrollmentId),
    );
    let changed = 0;
    for (const r of input.rows) {
      if (!allowed.has(r.enrollmentId)) throw new ActionError("A student in the list isn't in this batch.");
      if (r.marks !== null && r.marks > max) throw new ActionError(`Marks can't be more than ${max}.`);
      const existing = a.results.find((x) => x.enrollmentId === r.enrollmentId);
      const marks = r.isAbsent ? null : r.marks;
      const same =
        existing &&
        existing.isAbsent === r.isAbsent &&
        (existing.marks === null ? marks === null : Number(existing.marks) === marks) &&
        existing.remarks === r.remarks;
      if (same || (!existing && marks === null && !r.isAbsent)) continue;
      if (certified.has(r.enrollmentId))
        throw new ActionError("Marks of a student with an issued certificate can't be changed.");
      changed++;
      if (marks === null && !r.isAbsent) {
        await tx.assessmentResult.delete({ where: { id: existing!.id } });
        continue;
      }
      await tx.assessmentResult.upsert({
        where: { assessmentId_enrollmentId: { assessmentId: a.id, enrollmentId: r.enrollmentId } },
        create: {
          assessmentId: a.id,
          enrollmentId: r.enrollmentId,
          marks: marks === null ? null : String(marks),
          isAbsent: r.isAbsent,
          remarks: r.remarks,
          enteredById: ctx.user.id,
        },
        update: {
          marks: marks === null ? null : String(marks),
          isAbsent: r.isAbsent,
          remarks: r.remarks,
          enteredById: ctx.user.id,
        },
      });
    }
    if (changed)
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "AssessmentMarks",
        entityId: a.id,
        branchId: a.batch.branchId,
        after: { assessment: a.title, changed },
      });
  });
}

// ------------------------------------------------------------------ certificates

/** Everything the certificate rules look at, for one enrollment. */
export async function enrollmentStanding(tx: Tx | typeof db, enrollmentId: string, rules: CertificateRules) {
  const e = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      installments: true,
      attendance: { select: { status: true } },
      results: { where: { assessment: { deletedAt: null } }, include: { assessment: { include: { type: true } } } },
      certificates: { where: { status: "ISSUED" }, select: { id: true } },
    },
  });
  const duePaise = e.installments.reduce(
    (a, i) =>
      a +
      instalmentDue({
        id: i.id,
        sequence: i.sequence,
        amount: rupeesToPaise(String(i.amount)),
        paid: rupeesToPaise(String(i.paidAmount)),
        status: i.status,
      }),
    0,
  );
  const attendancePct = attendancePercent(e.attendance.map((x) => x.status));
  const results = e.results.map((r) => ({
    marks: r.marks === null ? null : Number(r.marks),
    maxMarks: Number(r.assessment.maxMarks),
    isAbsent: r.isAbsent,
  }));
  const check = certificateEligibility(
    { status: e.status, duePaise, attendancePct, results, hasCertificate: e.certificates.length > 0 },
    rules,
  );
  return { enrollment: e, duePaise, attendancePct, ...check };
}

export async function issueCertificate(ctx: ActionContext, input: z.output<typeof issueCertificateSchema>) {
  if (input.issuedAt > todayYmd()) throw new ActionError("The issue date can't be in the future.");
  return db.$transaction(async (tx) => {
    const e = await tx.enrollment.findFirst({
      where: { id: input.enrollmentId, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!e) throw new ActionError("Enrollment not found.");
    if (!canAccessBranch(ctx.user.access, "certificates.issue", e.branchId))
      throw new ActionError("You can't issue certificates for this branch.");
    // One certificate at a time per enrollment, even with two people clicking at once.
    await tx.$queryRaw`SELECT id FROM "Enrollment" WHERE id = ${e.id} FOR UPDATE`;
    const standing = await enrollmentStanding(tx, e.id, await getCertificateRules(ctx.user.organizationId, tx));
    if (!standing.eligible) throw new ActionError(standing.problems.join(" "));
    const issuedAt = dateOnly(input.issuedAt);
    const cert = await tx.certificate.create({
      data: {
        organizationId: e.organizationId,
        branchId: e.branchId,
        enrollmentId: e.id,
        certificateNo: await nextDocNumber(tx, { branchId: e.branchId, docType: "CERTIFICATE", date: issuedAt }),
        verifyCode: makeVerifyCode((n) => randomBytes(n)),
        grade: standing.grade,
        percentage: standing.overall === null ? null : String(standing.overall),
        attendancePct: standing.attendancePct === null ? null : String(standing.attendancePct),
        issuedAt,
        issuedById: ctx.user.id,
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Certificate",
      entityId: cert.id,
      branchId: e.branchId,
      after: cert,
    });
    return cert.id;
  });
}

export async function revokeCertificate(ctx: ActionContext, input: z.output<typeof revokeCertificateSchema>) {
  await db.$transaction(async (tx) => {
    const c = await tx.certificate.findFirst({ where: { id: input.id, organizationId: ctx.user.organizationId } });
    if (!c) throw new ActionError("Certificate not found.");
    if (!canAccessBranch(ctx.user.access, "certificates.revoke", c.branchId)) throw new ActionError("Not your branch.");
    if (c.status !== "ISSUED") throw new ActionError("Already cancelled.");
    await tx.certificate.update({
      where: { id: c.id },
      data: { status: "REVOKED", revokedReason: input.reason, revokedAt: new Date(), revokedById: ctx.user.id },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Certificate",
      entityId: c.id,
      branchId: c.branchId,
      before: { status: "ISSUED" },
      after: { status: "REVOKED", reason: input.reason },
    });
  });
}

// ------------------------------------------------------------------ placement opt-out (on the enrollment)

export async function setPlacementOptOut(ctx: ActionContext, input: z.output<typeof placementOptOutSchema>) {
  await db.$transaction(async (tx) => {
    const e = await tx.enrollment.findFirst({
      where: { id: input.enrollmentId, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!e) throw new ActionError("Enrollment not found.");
    if (
      !canAccessBranch(ctx.user.access, "placements.manage_applications", e.branchId) &&
      !canAccessBranch(ctx.user.access, "students.update", e.branchId)
    )
      throw new ActionError("Not your branch.");
    if (e.placementOptOut === input.optOut) return;
    await tx.enrollment.update({ where: { id: e.id }, data: { placementOptOut: input.optOut } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Enrollment",
      entityId: e.id,
      branchId: e.branchId,
      before: { placementOptOut: e.placementOptOut },
      after: { placementOptOut: input.optOut },
    });
  });
  revalidateSite();
}
