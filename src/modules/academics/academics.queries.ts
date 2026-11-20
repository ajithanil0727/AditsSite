import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, branchWhere, canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { overallPercent, resultPercent } from "./academic-logic";
import { enrollmentStanding, getCertificateRules } from "./academics.service";

const n = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function assessmentTypeOptions(orgId: string) {
  const rows = await db.assessmentType.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: "asc" },
  });
  return rows.map((t) => ({ value: t.id, label: t.name }));
}

/** Assessments of a batch with how far marking has got. */
export async function batchAssessments(batchId: string) {
  const rows = await db.assessment.findMany({
    where: { batchId, deletedAt: null },
    include: { type: true, results: { select: { marks: true, isAbsent: true } } },
    orderBy: { date: "desc" },
  });
  return rows.map((a) => {
    const marked = a.results.filter((r) => r.isAbsent || r.marks !== null);
    const avg = overallPercent(
      marked.map((r) => ({ marks: n(r.marks), maxMarks: Number(a.maxMarks), isAbsent: r.isAbsent })),
    );
    return {
      id: a.id,
      title: a.title,
      type: a.type.name,
      typeId: a.typeId,
      date: ymd(a.date)!,
      maxMarks: Number(a.maxMarks),
      passMarks: Number(a.passMarks),
      marked: marked.length,
      average: avg,
    };
  });
}
export type BatchAssessmentRow = Awaited<ReturnType<typeof batchAssessments>>[number];

/** Marks sheet: the batch's students (and anyone already marked here), with what they have. */
export async function getAssessmentSheet(user: CurrentUser, id: string) {
  const a = await db.assessment.findFirst({
    where: { id, deletedAt: null, batch: { organizationId: user.organizationId, deletedAt: null } },
    include: {
      type: true,
      batch: { include: { course: { select: { name: true } }, branch: { select: { name: true } } } },
      results: true,
    },
  });
  if (!a) return null;
  const viewable =
    canAccessBranch(user.access, "assessments.view", a.batch.branchId) &&
    (scopeOf(user.access, "assessments.view") !== "OWN" || a.batch.trainerId === user.id);
  if (!viewable) return null;
  const canEnter =
    canAccessBranch(user.access, "assessments.enter_marks", a.batch.branchId) &&
    (scopeOf(user.access, "assessments.enter_marks") !== "OWN" || a.batch.trainerId === user.id);
  const canManage =
    canAccessBranch(user.access, "assessments.manage", a.batch.branchId) &&
    (scopeOf(user.access, "assessments.manage") !== "OWN" || a.batch.trainerId === user.id);
  const enrollments = await db.enrollment.findMany({
    where: {
      deletedAt: null,
      OR: [{ batchId: a.batchId, status: { not: "DROPPED" } }, { id: { in: a.results.map((r) => r.enrollmentId) } }],
    },
    include: {
      student: { select: { id: true, name: true, studentCode: true } },
      certificates: { where: { status: "ISSUED" }, select: { id: true } },
    },
    orderBy: { student: { name: "asc" } },
  });
  return {
    id: a.id,
    title: a.title,
    type: a.type.name,
    typeId: a.typeId,
    date: ymd(a.date)!,
    maxMarks: Number(a.maxMarks),
    passMarks: Number(a.passMarks),
    batch: { id: a.batch.id, name: a.batch.name, course: a.batch.course.name, branch: a.batch.branch.name },
    canEnter,
    canManage,
    students: enrollments.map((e) => {
      const r = a.results.find((x) => x.enrollmentId === e.id);
      return {
        enrollmentId: e.id,
        studentId: e.student.id,
        name: e.student.name,
        code: e.student.studentCode,
        marks: r ? n(r.marks) : null,
        isAbsent: r?.isAbsent ?? false,
        remarks: r?.remarks ?? "",
        locked: e.certificates.length > 0,
      };
    }),
  };
}

// ------------------------------------------------------------------ certificates

export async function listCertificates(
  user: CurrentUser,
  opts: { activeBranchId: string | null; q: string | null; status: string | null },
) {
  const c = branchConstraint(user.access, "certificates.view", opts.activeBranchId);
  const rows = await db.certificate.findMany({
    where: {
      organizationId: user.organizationId,
      ...branchWhere(c),
      ...(opts.status === "ISSUED" || opts.status === "REVOKED" ? { status: opts.status } : {}),
      ...(opts.q
        ? {
            OR: [
              { certificateNo: { contains: opts.q, mode: "insensitive" as const } },
              { enrollment: { student: { name: { contains: opts.q, mode: "insensitive" as const } } } },
              { enrollment: { student: { studentCode: { contains: opts.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    include: {
      branch: { select: { code: true } },
      enrollment: {
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
          course: { select: { name: true } },
        },
      },
    },
    orderBy: [{ issuedAt: "desc" }, { certificateNo: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.certificateNo,
    student: r.enrollment.student.name,
    studentId: r.enrollment.student.id,
    studentCode: r.enrollment.student.studentCode,
    course: r.enrollment.course.name,
    branchCode: r.branch.code,
    branchId: r.branchId,
    grade: r.grade,
    percentage: n(r.percentage),
    issuedAt: ymd(r.issuedAt)!,
    status: r.status,
    revokedReason: r.revokedReason,
  }));
}
export type CertificateRow = Awaited<ReturnType<typeof listCertificates>>[number];

/** Completed enrollments without a certificate, with what (if anything) stops one being issued. */
export async function certificateCandidates(user: CurrentUser, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "certificates.view", activeBranchId);
  const rules = await getCertificateRules(user.organizationId);
  const rows = await db.enrollment.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: "COMPLETED",
      certificates: { none: { status: "ISSUED" } },
      ...branchWhere(c),
    },
    include: {
      student: { select: { id: true, name: true, studentCode: true } },
      course: { select: { name: true } },
      branch: { select: { code: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 100,
  });
  const out = [];
  for (const e of rows) {
    const s = await enrollmentStanding(db, e.id, rules);
    out.push({
      enrollmentId: e.id,
      studentId: e.student.id,
      student: e.student.name,
      studentCode: e.student.studentCode,
      course: e.course.name,
      branchCode: e.branch.code,
      branchId: e.branchId,
      completedAt: ymd(e.completedAt),
      overall: s.overall,
      grade: s.grade,
      attendancePct: s.attendancePct,
      duePaise: s.duePaise,
      eligible: s.eligible,
      problems: s.problems,
      canIssue: canAccessBranch(user.access, "certificates.issue", e.branchId),
    });
  }
  return out;
}
export type CandidateRow = Awaited<ReturnType<typeof certificateCandidates>>[number];

const certificateInclude = {
  branch: true,
  enrollment: {
    include: {
      student: { select: { name: true, studentCode: true, guardianName: true, photoId: true } },
      course: { select: { name: true, code: true } },
      batch: { select: { startDate: true, endDate: true } },
    },
  },
} satisfies Prisma.CertificateInclude;

export async function getCertificateForPrint(user: CurrentUser, id: string) {
  const c = await db.certificate.findFirst({
    where: { id, organizationId: user.organizationId },
    include: certificateInclude,
  });
  if (!c) return null;
  const own = await db.student.count({ where: { userId: user.id, enrollments: { some: { id: c.enrollmentId } } } });
  if (!own && !canAccessBranch(user.access, "certificates.view", c.branchId)) return null;
  if (own && c.status !== "ISSUED") return null; // students only see valid certificates
  return c;
}

/** Public verification (QR target). Only what's printed on the certificate itself. */
export async function verifyCertificate(where: { code: string } | { number: string; issuedOn: string }) {
  const c = await db.certificate.findFirst({
    where:
      "code" in where
        ? { verifyCode: where.code }
        : {
            certificateNo: { equals: where.number.trim(), mode: "insensitive" },
            issuedAt: new Date(`${where.issuedOn}T00:00:00.000Z`),
          },
    include: certificateInclude,
  });
  if (!c) return null;
  return {
    number: c.certificateNo,
    status: c.status,
    student: c.enrollment.student.name,
    studentCode: c.enrollment.student.studentCode,
    course: c.enrollment.course.name,
    branch: c.branch.name,
    grade: c.grade,
    issuedAt: ymd(c.issuedAt)!,
    completedAt: ymd(c.enrollment.completedAt),
    enrolledAt: ymd(c.enrollment.enrolledAt)!,
  };
}

/** For the student profile: results per enrollment, certificate standing. */
export async function studentAcademics(user: CurrentUser, studentId: string) {
  const rules = await getCertificateRules(user.organizationId);
  const enrollments = await db.enrollment.findMany({
    where: { studentId, organizationId: user.organizationId, deletedAt: null },
    include: {
      course: { select: { name: true } },
      results: {
        where: { assessment: { deletedAt: null } },
        include: { assessment: { include: { type: true } } },
        orderBy: { assessment: { date: "asc" } },
      },
      certificates: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { enrolledAt: "desc" },
  });
  const out = [];
  for (const e of enrollments) {
    const s = await enrollmentStanding(db, e.id, rules);
    out.push({
      enrollmentId: e.id,
      course: e.course.name,
      status: e.status,
      placementOptOut: e.placementOptOut,
      branchId: e.branchId,
      results: e.results.map((r) => ({
        id: r.id,
        title: r.assessment.title,
        type: r.assessment.type.name,
        date: ymd(r.assessment.date)!,
        marks: n(r.marks),
        maxMarks: Number(r.assessment.maxMarks),
        passMarks: Number(r.assessment.passMarks),
        isAbsent: r.isAbsent,
        percent: resultPercent({ marks: n(r.marks), maxMarks: Number(r.assessment.maxMarks), isAbsent: r.isAbsent }),
      })),
      overall: s.overall,
      grade: s.grade,
      attendancePct: s.attendancePct,
      eligible: s.eligible,
      problems: s.problems,
      certificates: e.certificates.map((c) => ({
        id: c.id,
        number: c.certificateNo,
        status: c.status,
        issuedAt: ymd(c.issuedAt)!,
        grade: c.grade,
      })),
    });
  }
  return out;
}
