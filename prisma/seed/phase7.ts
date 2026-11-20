/**
 * Phase 7 demo data: assessment types, two assessments with marks in the Palakkad SPE batch,
 * two demo hiring companies (not shown on the website), one open drive with students and an offer.
 * DEMO data. Idempotent: assessment types are ensured; the rest runs once (when no drive exists).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { DEMO } from "./mode";

type Ctx = { orgId: string; userIds: Record<string, string> };
const DAY = 86_400_000;

export async function seedPhase7(db: PrismaClient, ctx: Ctx) {
  const { orgId, userIds } = ctx;
  for (const name of ["Theory", "Practical", "Project"]) {
    const found = await db.assessmentType.findFirst({ where: { organizationId: orgId, name } });
    if (!found) await db.assessmentType.create({ data: { organizationId: orgId, name } });
  }
  if (!DEMO || (await db.placementDrive.count({ where: { organizationId: orgId } })) > 0) return;

  const theory = await db.assessmentType.findFirstOrThrow({ where: { organizationId: orgId, name: "Theory" } });
  const practical = await db.assessmentType.findFirstOrThrow({ where: { organizationId: orgId, name: "Practical" } });
  const batch = await db.batch.findFirst({
    where: { organizationId: orgId, code: "PKD-SPE-01" },
    include: {
      enrollments: { where: { deletedAt: null, status: { not: "DROPPED" } }, orderBy: { enrolledAt: "asc" } },
    },
  });
  const trainer = userIds["trainer.pkd@demo.test"] ?? null;
  const now = Date.now();

  if (batch && batch.enrollments.length > 0) {
    const tests = [
      {
        typeId: theory.id,
        title: "Module 1: basics of electronics",
        daysAgo: 30,
        max: 50,
        pass: 20,
        scores: [42, 35, 18, 47, 29],
      },
      {
        typeId: practical.id,
        title: "Module 1: soldering practical",
        daysAgo: 20,
        max: 100,
        pass: 40,
        scores: [88, 72, 45, 91, 60],
      },
    ];
    for (const t of tests) {
      const a = await db.assessment.create({
        data: {
          batchId: batch.id,
          typeId: t.typeId,
          title: t.title,
          date: new Date(new Date(now - t.daysAgo * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z"),
          maxMarks: t.max,
          passMarks: t.pass,
          createdById: trainer,
        },
      });
      await db.assessmentResult.createMany({
        data: batch.enrollments.map((e, i) => ({
          assessmentId: a.id,
          enrollmentId: e.id,
          marks: t.scores[i % t.scores.length],
          isAbsent: false,
          enteredById: trainer,
        })),
      });
    }
  }

  // --- Demo hiring companies and a drive (not shown on the website) ---
  const quickfix = await db.company.create({
    data: {
      organizationId: orgId,
      name: "Demo Mobile Care Pvt Ltd",
      industry: "Mobile service",
      city: "Kochi",
      contacts: { create: [{ name: "Demo HR Manager", designation: "HR", phone: "9000000101" }] },
    },
  });
  await db.company.create({
    data: {
      organizationId: orgId,
      name: "Demo Laptop Clinic",
      industry: "Laptop service",
      city: "Kozhikode",
      contacts: { create: [{ name: "Demo Owner", designation: "Proprietor", phone: "9000000102" }] },
    },
  });
  const spe = await db.course.findFirst({ where: { organizationId: orgId, code: "SPE" } });
  const pkd = batch?.branchId ?? null;
  const drive = await db.placementDrive.create({
    data: {
      organizationId: orgId,
      branchId: pkd,
      companyId: quickfix.id,
      title: "Demo campus drive",
      jobRole: "Mobile service technician",
      location: "Kochi",
      salaryMin: 12000,
      salaryMax: 18000,
      driveDate: new Date(new Date(now - 5 * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z"),
      createdById: userIds["placement@demo.test"] ?? null,
      courses: spe ? { create: [{ courseId: spe.id }] } : undefined,
    },
  });
  const forward = (batch?.enrollments ?? []).slice(0, 3);
  for (const [i, e] of forward.entries()) {
    const app = await db.placementApplication.create({
      data: {
        driveId: drive.id,
        studentId: e.studentId,
        enrollmentId: e.id,
        status: i === 0 ? "SELECTED" : i === 1 ? "IN_PROCESS" : "APPLIED",
      },
    });
    if (i <= 1) {
      await db.interviewRound.create({
        data: {
          applicationId: app.id,
          roundNo: 1,
          name: "Technical test",
          scheduledAt: drive.driveDate,
          result: "PASSED",
        },
      });
    }
    if (i === 0) {
      await db.placementOffer.create({
        data: {
          applicationId: app.id,
          offeredAt: drive.driveDate!,
          designation: "Junior technician",
          ctcAnnual: 168000,
          joiningStatus: "PENDING",
        },
      });
    }
  }
}
