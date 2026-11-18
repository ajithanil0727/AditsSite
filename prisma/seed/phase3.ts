/**
 * Phase 3 demo data: courses (fee plans + syllabus), batches, students with instalments,
 * receipts, one overdue due and a week of attendance. Idempotent: skips when courses exist.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { DocType } from "../../src/generated/prisma/enums";
import { financialYear } from "../../src/lib/fy";
import { DEFAULT_FORMATS, formatDocNumber } from "../../src/modules/numbering/format";

type Ctx = { orgId: string; branchIds: Record<string, string>; userIds: Record<string, string> };
const DAY = 86_400_000;

async function reserve(db: PrismaClient, branchId: string, code: string, docType: DocType, date: Date, orgId: string) {
  const fy = financialYear(date);
  const def = DEFAULT_FORMATS[docType];
  const row = await db.numberSeries.upsert({
    where: { branchId_docType_financialYear: { branchId, docType, financialYear: fy } },
    create: {
      organizationId: orgId,
      branchId,
      docType,
      financialYear: fy,
      format: def.format,
      padding: def.padding,
      nextNumber: 2,
    },
    update: { nextNumber: { increment: 1 } },
  });
  return formatDocNumber({ format: row.format, branchCode: code, date, seq: row.nextNumber - 1, padding: row.padding });
}

const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function seedPhase3(db: PrismaClient, ctx: Ctx) {
  const { orgId } = ctx;
  if ((await db.course.count({ where: { organizationId: orgId } })) > 0) return;
  const sac = await db.hsnSac.findFirst({ where: { organizationId: orgId, code: "998719" } });

  const courseDefs = [
    {
      code: "MOB-ADV",
      name: "Advanced Chip-Level Mobile Repair",
      months: 4,
      fee: 35000,
      short: "Board-level mobile repair: schematics, PMIC, charging, network and display sections, BGA rework.",
      modules: [
        "Electronics fundamentals & tools",
        "Reading schematics and board views",
        "Power & charging section",
        "Network & RF section",
        "Display, touch & camera",
        "BGA reballing and IC rework",
        "Software flashing & unlocking",
        "Live repair practice",
      ],
    },
    {
      code: "LAP-CHIP",
      name: "Laptop & Desktop Chip-Level Repair",
      months: 3,
      fee: 30000,
      short: "Motherboard-level laptop repair: power sequences, BIOS, charging circuits and display.",
      modules: [
        "Motherboard architecture",
        "Power-on sequence & voltages",
        "Charging & battery circuits",
        "BIOS programming",
        "Display & backlight",
        "Live repair practice",
      ],
    },
    {
      code: "MOB-BASIC",
      name: "Mobile Repair Basics",
      months: 1,
      fee: 9000,
      short: "Entry course: disassembly, part replacement, basic fault finding.",
      modules: [
        "Tools & safety",
        "Disassembly and assembly",
        "Display, battery and port replacement",
        "Basic fault finding",
      ],
    },
  ];
  const courses: Record<string, { id: string; fee: number }> = {};
  for (const [i, c] of courseDefs.entries()) {
    const course = await db.course.create({
      data: {
        organizationId: orgId,
        code: c.code,
        name: c.name,
        slug: c.code.toLowerCase(),
        durationValue: c.months,
        durationUnit: "MONTHS",
        fee: c.fee,
        gstMode: "EXEMPT",
        hsnSacId: sac?.id,
        shortDescription: c.short,
        eligibility: "10th pass or above",
        isFeatured: i < 2,
        sortOrder: i,
        modules: { create: c.modules.map((title, idx) => ({ title, sortOrder: idx, hours: 12 })) },
        feePlans: {
          create: [
            {
              name: "Full payment",
              items: { create: [{ label: "Full fee", percentOfFee: 100, dueAfterDays: 0, sortOrder: 0 }] },
            },
            ...(c.fee > 10000
              ? [
                  {
                    name: "3 instalments",
                    items: {
                      create: [
                        { label: "At admission", percentOfFee: 40, dueAfterDays: 0, sortOrder: 0 },
                        { label: "Instalment 2", percentOfFee: 30, dueAfterDays: 30, sortOrder: 1 },
                        { label: "Instalment 3", percentOfFee: 30, dueAfterDays: 60, sortOrder: 2 },
                      ],
                    },
                  },
                ]
              : []),
          ],
        },
      },
    });
    courses[c.code] = { id: course.id, fee: c.fee };
  }

  const trainer = ctx.userIds["trainer.koc@demo.test"];
  const now = new Date();
  const started = dateOnly(new Date(now.getTime() - 40 * DAY));
  const batches = {
    kocAdv: await db.batch.create({
      data: {
        organizationId: orgId,
        branchId: ctx.branchIds.KOC,
        courseId: courses["MOB-ADV"].id,
        trainerId: trainer,
        code: "KOC-ADV-01",
        name: "Mobile Advanced · Morning",
        startDate: started,
        timing: "09:30–12:30",
        days: "Mon–Sat",
        capacity: 15,
        status: "ONGOING",
      },
    }),
    kocLap: await db.batch.create({
      data: {
        organizationId: orgId,
        branchId: ctx.branchIds.KOC,
        courseId: courses["LAP-CHIP"].id,
        trainerId: trainer,
        code: "KOC-LAP-01",
        name: "Laptop Chip-Level · Evening",
        startDate: dateOnly(new Date(now.getTime() + 10 * DAY)),
        timing: "17:00–20:00",
        days: "Mon–Fri",
        capacity: 12,
        status: "PLANNED",
      },
    }),
    tvmAdv: await db.batch.create({
      data: {
        organizationId: orgId,
        branchId: ctx.branchIds.TVM,
        courseId: courses["MOB-ADV"].id,
        code: "TVM-ADV-01",
        name: "Mobile Advanced · Afternoon",
        startDate: started,
        timing: "14:00–17:00",
        days: "Mon–Sat",
        capacity: 15,
        status: "ONGOING",
      },
    }),
  };

  const cash = await db.moneyAccount.findFirst({ where: { branchId: ctx.branchIds.KOC, type: "CASH" } });
  const upi = await db.paymentMode.findFirst({ where: { organizationId: orgId, name: "UPI" } });
  const cashMode = await db.paymentMode.findFirst({ where: { organizationId: orgId, name: "Cash" } });
  const frontDesk = ctx.userIds["frontdesk.koc@demo.test"];

  const people: {
    name: string;
    phone: string;
    city: string;
    batch: keyof typeof batches;
    course: string;
    paid: number[];
    three: boolean;
  }[] = [
    {
      name: "Midhun Krishna",
      phone: "9746200001",
      city: "Aluva",
      batch: "kocAdv",
      course: "MOB-ADV",
      paid: [14000, 10500],
      three: true,
    },
    {
      name: "Ashwin Babu",
      phone: "9746200002",
      city: "Kakkanad",
      batch: "kocAdv",
      course: "MOB-ADV",
      paid: [14000],
      three: true,
    },
    {
      name: "Fathima Rinsha",
      phone: "9746200003",
      city: "Edappally",
      batch: "kocAdv",
      course: "MOB-ADV",
      paid: [35000],
      three: false,
    },
    {
      name: "Rahul Raj",
      phone: "9746200004",
      city: "Thrissur",
      batch: "kocAdv",
      course: "MOB-ADV",
      paid: [14000, 10500, 10500],
      three: true,
    },
    {
      name: "Nikhil Jose",
      phone: "9746200005",
      city: "Kalamassery",
      batch: "kocLap",
      course: "LAP-CHIP",
      paid: [12000],
      three: true,
    },
  ];
  for (const [idx, p] of people.entries()) {
    const branchId = ctx.branchIds.KOC;
    const enrolledAt = p.batch === "kocLap" ? dateOnly(new Date(now.getTime() - 3 * DAY)) : started;
    const studentCode = await reserve(db, branchId, "KOC", "STUDENT_ID", enrolledAt, orgId);
    const student = await db.student.create({
      data: {
        organizationId: orgId,
        branchId,
        studentCode,
        name: p.name,
        phone: p.phone,
        city: p.city,
        state: "Kerala",
        qualification: idx % 2 ? "Diploma in Electronics" : "Plus Two",
      },
    });
    const fee = courses[p.course].fee;
    const plan = p.three ? [0.4, 0.3, 0.3] : [1];
    const enrollment = await db.enrollment.create({
      data: {
        organizationId: orgId,
        branchId,
        studentId: student.id,
        courseId: courses[p.course].id,
        batchId: batches[p.batch].id,
        enrolledAt,
        courseFee: fee,
        netFee: fee,
        gstMode: "EXEMPT",
        installments: {
          create: plan.map((share, i) => ({
            sequence: i + 1,
            label: plan.length === 1 ? "Full fee" : i === 0 ? "At admission" : `Instalment ${i + 1}`,
            dueDate: new Date(enrolledAt.getTime() + i * 30 * DAY),
            amount: Math.round(fee * share),
          })),
        },
      },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    for (const [i, amount] of p.paid.entries()) {
      const inst = enrollment.installments[i];
      const paidAt = new Date(inst.dueDate.getTime() + 4 * 3_600_000);
      const receiptNo = await reserve(db, branchId, "KOC", "FEE_RECEIPT", paidAt, orgId);
      const pay = await db.feePayment.create({
        data: {
          organizationId: orgId,
          branchId,
          enrollmentId: enrollment.id,
          receiptNo,
          paidAt,
          amount,
          paymentModeId: (i % 2 ? cashMode : upi)!.id,
          moneyAccountId: cash!.id,
          reference: i % 2 ? null : `UPI${String(400000 + idx * 10 + i)}`,
          collectedById: frontDesk,
          allocations: { create: [{ installmentId: inst.id, amount }] },
        },
      });
      await db.feeInstallment.update({
        where: { id: inst.id },
        data: { paidAmount: amount, status: amount >= Number(inst.amount) ? "PAID" : "PARTIAL" },
      });
      await db.moneyTransaction.create({
        data: {
          organizationId: orgId,
          branchId,
          moneyAccountId: cash!.id,
          date: dateOnly(paidAt),
          direction: "IN",
          amount,
          source: "FEE_PAYMENT",
          refType: "FeePayment",
          refId: pay.id,
          narration: `Fee · ${p.name} · ${receiptNo}`,
          createdById: frontDesk,
        },
      });
    }
  }

  // A week of attendance for the running Kochi batch.
  const roster = await db.enrollment.findMany({ where: { batchId: batches.kocAdv.id } });
  for (let d = 7; d >= 1; d--) {
    const date = dateOnly(new Date(now.getTime() - d * DAY));
    if (date.getUTCDay() === 0) continue; // Sunday
    const session = await db.batchSession.create({
      data: {
        batchId: batches.kocAdv.id,
        date,
        topic: d > 4 ? "Charging section fault finding" : "PMIC replacement practice",
        takenById: trainer,
      },
    });
    await db.studentAttendance.createMany({
      data: roster.map((e, i) => ({
        sessionId: session.id,
        enrollmentId: e.id,
        status: (i + d) % 6 === 0 ? "ABSENT" : (i + d) % 9 === 0 ? "LATE" : "PRESENT",
      })),
    });
  }
}
