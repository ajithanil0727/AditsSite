/**
 * Integration test (real database) for Phase 7: marks, certificate rules (completed + paid + passed + attendance),
 * issue / verify / cancel / re-issue, the Admin role not issuing, and placements (drive → offer → placement %).
 * Uses its own student, batch and course data at Mukkam, removed afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { verifyCertificate } from "@/modules/academics/academics.queries";
import {
  enrollmentStanding,
  getCertificateRules,
  issueCertificate,
  revokeCertificate,
  saveAssessment,
  saveMarks,
  setPlacementOptOut,
} from "@/modules/academics/academics.service";
import { placementStats } from "@/modules/placements/placements.queries";
import { addApplicants, saveCompany, saveDrive, saveOffer, saveRound } from "@/modules/placements/placements.service";
import { buildAccess } from "@/modules/rbac/access";
import type { ActionContext } from "@/modules/rbac/action";

const hasDb = !!process.env.DATABASE_URL;
const TAG = "ZZTEST7";

async function ctxFor(email: string): Promise<ActionContext> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      branches: true,
    },
  });
  const access = buildAccess({
    userId: u.id,
    organizationId: u.organizationId,
    assignedBranchIds: u.branches.map((b) => b.branchId),
    roles: u.roles.map((r) => ({ scope: r.scope, permissions: r.role.permissions.map((p) => p.permission.key) })),
  });
  return {
    user: { id: u.id, name: u.name, email: u.email, image: null, organizationId: u.organizationId, access },
    activeBranchId: null,
    actor: { organizationId: u.organizationId, userId: u.id },
  };
}

async function cleanup() {
  const students = await db.student.findMany({ where: { studentCode: { startsWith: TAG } }, select: { id: true } });
  const sIds = students.map((s) => s.id);
  const enrollments = await db.enrollment.findMany({ where: { studentId: { in: sIds } }, select: { id: true } });
  const eIds = enrollments.map((e) => e.id);
  const companies = await db.company.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const drives = await db.placementDrive.findMany({
    where: { companyId: { in: companies.map((c) => c.id) } },
    select: { id: true },
  });
  await db.placementApplication.deleteMany({ where: { driveId: { in: drives.map((d) => d.id) } } });
  await db.placementDrive.deleteMany({ where: { id: { in: drives.map((d) => d.id) } } });
  await db.company.deleteMany({ where: { id: { in: companies.map((c) => c.id) } } });
  await db.certificate.deleteMany({ where: { enrollmentId: { in: eIds } } });
  await db.assessmentResult.deleteMany({ where: { enrollmentId: { in: eIds } } });
  await db.studentAttendance.deleteMany({ where: { enrollmentId: { in: eIds } } });
  const batches = await db.batch.findMany({ where: { code: { startsWith: TAG } }, select: { id: true } });
  await db.assessment.deleteMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
  await db.batchSession.deleteMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
  await db.feeInstallment.deleteMany({ where: { enrollmentId: { in: eIds } } });
  await db.enrollment.deleteMany({ where: { id: { in: eIds } } });
  await db.batch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
  await db.student.deleteMany({ where: { id: { in: sIds } } });
}

describe.skipIf(!hasDb)("assessments, certificates and placements", () => {
  let owner: ActionContext;
  let admin: ActionContext;
  let ids: { mkm: string; course: string; batch: string; enr: string; optOutEnr: string; theory: string; inst: string };

  beforeAll(async () => {
    await cleanup();
    owner = await ctxFor("arun@demo.test");
    admin = await ctxFor("admin@demo.test");
    const mkm = await db.branch.findFirstOrThrow({ where: { code: "MKM" } });
    const course = await db.course.findFirstOrThrow({ where: { code: "SPE" } });
    const batch = await db.batch.create({
      data: {
        organizationId: mkm.organizationId,
        branchId: mkm.id,
        courseId: course.id,
        code: `${TAG}-B`,
        name: "Test batch",
        startDate: new Date("2024-06-03T00:00:00Z"),
        timing: "10:00-13:00",
        capacity: 10,
      },
    });
    const mk = async (n: number) => {
      const s = await db.student.create({
        data: {
          organizationId: mkm.organizationId,
          branchId: mkm.id,
          studentCode: `${TAG}${n}`,
          name: `Test Student ${n}`,
          phone: `900000071${n}`,
        },
      });
      return db.enrollment.create({
        data: {
          organizationId: mkm.organizationId,
          branchId: mkm.id,
          studentId: s.id,
          courseId: course.id,
          batchId: batch.id,
          enrolledAt: new Date("2024-06-03T00:00:00Z"),
          courseFee: 1000,
          netFee: 1000,
          gstMode: "EXEMPT",
          installments: {
            create: [{ sequence: 1, label: "Full fee", dueDate: new Date("2024-06-03T00:00:00Z"), amount: 1000 }],
          },
        },
        include: { installments: true },
      });
    };
    const e1 = await mk(1);
    const e2 = await mk(2);
    // 4 sessions: 3 present + 1 absent = 75% (exactly the default minimum).
    for (const [i, status] of (["PRESENT", "PRESENT", "ABSENT", "PRESENT"] as const).entries()) {
      const session = await db.batchSession.create({
        data: { batchId: batch.id, date: new Date(Date.UTC(2024, 6, 1 + i)) },
      });
      await db.studentAttendance.create({ data: { sessionId: session.id, enrollmentId: e1.id, status } });
    }
    ids = {
      mkm: mkm.id,
      course: course.id,
      batch: batch.id,
      enr: e1.id,
      optOutEnr: e2.id,
      theory: (await db.assessmentType.findFirstOrThrow({ where: { name: "Theory" } })).id,
      inst: e1.installments[0].id,
    };
  });

  afterAll(cleanup);

  it("enters marks and works out the overall % and grade", async () => {
    const a1 = await saveAssessment(owner, {
      batchId: ids.batch,
      typeId: ids.theory,
      title: "Test A",
      date: "2024-07-10",
      maxMarks: 50,
      passMarks: 20,
    });
    const a2 = await saveAssessment(owner, {
      batchId: ids.batch,
      typeId: ids.theory,
      title: "Test B",
      date: "2024-07-20",
      maxMarks: 100,
      passMarks: 40,
    });
    await expect(
      saveMarks(owner, {
        assessmentId: a1,
        rows: [{ enrollmentId: ids.enr, marks: 51, isAbsent: false, remarks: null }],
      }),
    ).rejects.toThrow(/more than 50/);
    await saveMarks(owner, {
      assessmentId: a1,
      rows: [{ enrollmentId: ids.enr, marks: 30, isAbsent: false, remarks: null }],
    }); // 60%
    await saveMarks(owner, {
      assessmentId: a2,
      rows: [{ enrollmentId: ids.enr, marks: 70, isAbsent: false, remarks: null }],
    }); // 70%
    const s = await enrollmentStanding(db, ids.enr, await getCertificateRules(owner.user.organizationId));
    expect(s.overall).toBe(65);
    expect(s.grade).toBe("B");
    expect(s.attendancePct).toBe(75);
  });

  it("refuses a certificate until completed and paid; the Admin role can't issue", async () => {
    await expect(issueCertificate(owner, { enrollmentId: ids.enr, issuedAt: "2024-12-01" })).rejects.toThrow(
      /completed/,
    );
    await db.enrollment.update({
      where: { id: ids.enr },
      data: { status: "COMPLETED", completedAt: new Date("2024-11-30T00:00:00Z") },
    });
    await expect(issueCertificate(owner, { enrollmentId: ids.enr, issuedAt: "2024-12-01" })).rejects.toThrow(
      /Fees of ₹1,000/,
    );
    await db.feeInstallment.update({ where: { id: ids.inst }, data: { status: "PAID", paidAmount: 1000 } });
    await expect(issueCertificate(admin, { enrollmentId: ids.enr, issuedAt: "2024-12-01" })).rejects.toThrow(
      /can't issue/,
    );
  });

  it("issues, verifies, freezes marks, cancels and re-issues", async () => {
    const id = await issueCertificate(owner, { enrollmentId: ids.enr, issuedAt: "2024-12-01" });
    const cert = await db.certificate.findUniqueOrThrow({ where: { id } });
    expect(cert.certificateNo).toMatch(/^MKM\/CERT\/24-25\/\d{5}$/);
    expect(cert.grade).toBe("B");
    expect(Number(cert.percentage)).toBe(65);
    expect(cert.verifyCode).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect((await verifyCertificate({ code: cert.verifyCode }))?.status).toBe("ISSUED");
    expect(
      (await verifyCertificate({ number: cert.certificateNo.toLowerCase(), issuedOn: "2024-12-01" }))?.student,
    ).toBe("Test Student 1");
    expect(await verifyCertificate({ number: cert.certificateNo, issuedOn: "2024-12-02" })).toBeNull();
    await expect(issueCertificate(owner, { enrollmentId: ids.enr, issuedAt: "2024-12-01" })).rejects.toThrow(
      /already issued/,
    );

    const a = await db.assessment.findFirstOrThrow({ where: { batchId: ids.batch, title: "Test A" } });
    await expect(
      saveMarks(owner, {
        assessmentId: a.id,
        rows: [{ enrollmentId: ids.enr, marks: 45, isAbsent: false, remarks: null }],
      }),
    ).rejects.toThrow(/issued certificate/);

    await revokeCertificate(owner, { id, reason: "Name spelt wrong" });
    expect((await verifyCertificate({ code: cert.verifyCode }))?.status).toBe("REVOKED");
    const id2 = await issueCertificate(owner, { enrollmentId: ids.enr, issuedAt: "2024-12-05" });
    const cert2 = await db.certificate.findUniqueOrThrow({ where: { id: id2 } });
    expect(cert2.certificateNo).not.toBe(cert.certificateNo);
    expect(cert2.verifyCode).not.toBe(cert.verifyCode);
  });

  it("runs a drive to an offer and counts it in the placement %", async () => {
    await setPlacementOptOut(owner, { enrollmentId: ids.optOutEnr, optOut: true });
    const companyId = await saveCompany(owner, {
      name: `${TAG} Hiring Co`,
      industry: null,
      website: null,
      city: null,
      address: null,
      isActive: true,
      contacts: [],
    });
    const driveId = await saveDrive(owner, {
      companyId,
      branchId: ids.mkm,
      title: "Test drive",
      jobRole: "Technician",
      description: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      driveDate: null,
      lastDateToApply: null,
      courseIds: [ids.course],
      status: "OPEN",
    });
    await expect(addApplicants(owner, { driveId, enrollmentIds: [ids.optOutEnr] })).rejects.toThrow(
      /can't be put forward/,
    );
    expect(await addApplicants(owner, { driveId, enrollmentIds: [ids.enr] })).toBe(1);
    const app = await db.placementApplication.findFirstOrThrow({ where: { driveId } });
    await saveRound(owner, {
      applicationId: app.id,
      name: "Technical",
      scheduledAt: "2024-12-10",
      result: "PASSED",
      remarks: null,
    });
    expect((await db.placementApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("IN_PROCESS");
    await saveOffer(owner, {
      applicationId: app.id,
      offeredAt: "2024-12-12",
      designation: "Technician",
      ctcAnnual: 180000,
      joiningDate: null,
      joiningStatus: "PENDING",
    });
    expect((await db.placementApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("SELECTED");

    const stats = await placementStats(owner.user, ids.mkm);
    const batchRow = stats.byBatch.find((b) => b.key === ids.batch)!;
    // e1 completed + placed; e2 opted out and still studying: 1 of 1 = 100%.
    expect(batchRow).toMatchObject({ completed: 1, optedIn: 1, placed: 1, percent: 100 });

    await saveOffer(owner, {
      applicationId: app.id,
      offeredAt: "2024-12-12",
      designation: "Technician",
      ctcAnnual: 180000,
      joiningDate: null,
      joiningStatus: "DECLINED",
    });
    const after = await placementStats(owner.user, ids.mkm);
    expect(after.byBatch.find((b) => b.key === ids.batch)).toMatchObject({ placed: 0, percent: 0 });
  });
});
