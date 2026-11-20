import "server-only";
import { db } from "@/lib/db";
import { attendancePercent } from "@/modules/fees/fee-logic";
import { overallPercent } from "@/modules/academics/academic-logic";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const n = (v: unknown) => Number(v ?? 0);

/** The student linked to this login, or null (staff accounts). */
export async function portalStudent(userId: string) {
  return db.student.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true, name: true, studentCode: true, phone: true, email: true, organizationId: true, branch: { select: { name: true, phone: true } } },
  });
}

/** Everything a student sees about themselves. Read-only. */
export async function portalOverview(studentId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, deletedAt: null },
    include: {
      course: { select: { name: true } },
      branch: { select: { name: true } },
      batch: { select: { name: true, timing: true, trainer: { select: { name: true } } } },
      installments: { orderBy: { sequence: "asc" } },
      payments: { where: { cancelledAt: null }, orderBy: { paidAt: "desc" }, include: { paymentMode: { select: { name: true } } } },
      attendance: { select: { status: true } },
      results: { where: { assessment: { deletedAt: null } }, include: { assessment: { include: { type: true } } }, orderBy: { assessment: { date: "asc" } } },
      certificates: { where: { status: "ISSUED" }, select: { id: true, certificateNo: true, issuedAt: true, grade: true, verifyCode: true } },
      applications: { include: { drive: { include: { company: { select: { name: true } } } }, offer: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });

  const out = enrollments.map((e) => {
    const due = e.installments.filter((i) => i.status === "DUE" || i.status === "PARTIAL");
    const results = e.results.map((r) => ({
      id: r.id,
      title: r.assessment.title,
      type: r.assessment.type.name,
      date: ymd(r.assessment.date)!,
      marks: r.marks === null ? null : n(r.marks),
      maxMarks: n(r.assessment.maxMarks),
      passMarks: n(r.assessment.passMarks),
      isAbsent: r.isAbsent,
    }));
    return {
      id: e.id,
      course: e.course.name,
      branch: e.branch.name,
      batch: e.batch ? `${e.batch.name} · ${e.batch.timing}${e.batch.trainer ? ` · ${e.batch.trainer.name}` : ""}` : null,
      status: e.status,
      enrolledAt: ymd(e.enrolledAt)!,
      netFee: n(e.netFee),
      paid: e.payments.reduce((a, p) => a + n(p.amount), 0),
      due: due.reduce((a, i) => a + n(i.amount) - n(i.paidAmount), 0),
      instalments: e.installments.map((i) => ({ id: i.id, label: i.label, dueDate: ymd(i.dueDate)!, amount: n(i.amount), paid: n(i.paidAmount), status: i.status })),
      receipts: e.payments.map((p) => ({ id: p.id, number: p.receiptNo, date: p.paidAt.toISOString(), amount: n(p.amount), mode: p.paymentMode.name })),
      attendancePct: attendancePercent(e.attendance.map((a) => a.status)),
      sessions: e.attendance.length,
      results,
      overall: overallPercent(results),
      certificate: e.certificates[0]
        ? { id: e.certificates[0].id, number: e.certificates[0].certificateNo, issuedAt: ymd(e.certificates[0].issuedAt)!, grade: e.certificates[0].grade, verifyCode: e.certificates[0].verifyCode }
        : null,
      applications: e.applications.map((a) => ({
        id: a.id,
        company: a.drive.company.name,
        role: a.drive.jobRole,
        status: a.status,
        offer: a.offer ? { designation: a.offer.designation, joiningStatus: a.offer.joiningStatus } : null,
      })),
      placementOptOut: e.placementOptOut,
      courseId: e.courseId,
      branchId: e.branchId,
      organizationId: e.organizationId,
    };
  });

  // Open jobs for any course they're on (and haven't opted out of placement help for).
  const jobsFor = out.filter((e) => !e.placementOptOut && e.status !== "DROPPED");
  const drives = jobsFor.length
    ? await db.placementDrive.findMany({
        where: {
          deletedAt: null,
          status: "OPEN",
          organizationId: jobsFor[0].organizationId,
          OR: jobsFor.map((e) => ({
            AND: [
              { OR: [{ branchId: null }, { branchId: e.branchId }] },
              { OR: [{ courses: { none: {} } }, { courses: { some: { courseId: e.courseId } } }] },
            ],
          })),
        },
        include: { company: { select: { name: true } } },
        orderBy: [{ lastDateToApply: "asc" }, { createdAt: "desc" }],
        take: 20,
      })
    : [];
  return {
    enrollments: out,
    jobs: drives.map((d) => ({
      id: d.id,
      title: d.title,
      role: d.jobRole,
      company: d.company.name,
      location: d.location,
      salaryMin: d.salaryMin === null ? null : n(d.salaryMin),
      salaryMax: d.salaryMax === null ? null : n(d.salaryMax),
      lastDate: ymd(d.lastDateToApply),
      driveDate: ymd(d.driveDate),
    })),
  };
}
