/**
 * Phase 6 demo data: HR masters, holidays (fixed-date national holidays only), employees linked to the
 * demo logins with salaries, last month's attendance with a few absences, an approved leave,
 * an advance and an approved incentive. DEMO figures. Idempotent: skips when employees exist.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { formatDocNumber } from "../../src/modules/numbering/format";

type Ctx = { orgId: string; branchIds: Record<string, string>; userIds: Record<string, string> };
const DAY = 86_400_000;

async function employeeCode(db: PrismaClient, orgId: string, branchId: string, code: string) {
  const row = await db.numberSeries.upsert({
    where: { branchId_docType_financialYear: { branchId, docType: "EMPLOYEE_ID", financialYear: "ALL" } },
    create: {
      organizationId: orgId,
      branchId,
      docType: "EMPLOYEE_ID",
      financialYear: "ALL",
      format: "{BRANCH}-E{SEQ}",
      padding: 3,
      resetPolicy: "NEVER",
      nextNumber: 2,
    },
    update: { nextNumber: { increment: 1 } },
  });
  return formatDocNumber({
    format: row.format,
    branchCode: code,
    date: new Date(),
    seq: row.nextNumber - 1,
    padding: row.padding,
  });
}

export async function seedPhase6(db: PrismaClient, ctx: Ctx) {
  const { orgId, branchIds, userIds } = ctx;
  if ((await db.employee.count({ where: { organizationId: orgId } })) > 0) return;

  // --- Masters ---
  const ensure = async <T>(find: () => Promise<T | null>, create: () => Promise<T>) =>
    (await find()) ?? (await create());
  const dept: Record<string, string> = {};
  for (const name of ["Training", "Service", "Front office", "Accounts", "Management"]) {
    dept[name] = (
      await ensure(
        () => db.department.findFirst({ where: { organizationId: orgId, name } }),
        () => db.department.create({ data: { organizationId: orgId, name } }),
      )
    ).id;
  }
  const desig: Record<string, string> = {};
  for (const name of [
    "Branch manager",
    "Counsellor",
    "Trainer",
    "Service manager",
    "Service engineer",
    "Store keeper",
  ]) {
    desig[name] = (
      await ensure(
        () => db.designation.findFirst({ where: { organizationId: orgId, name } }),
        () => db.designation.create({ data: { organizationId: orgId, name } }),
      )
    ).id;
  }
  const shift = await ensure(
    () => db.shift.findFirst({ where: { organizationId: orgId, name: "General" } }),
    () =>
      db.shift.create({
        data: { organizationId: orgId, name: "General", startTime: "09:30", endTime: "18:30", graceMinutes: 10 },
      }),
  );
  if ((await db.leaveType.count({ where: { organizationId: orgId } })) === 0) {
    await db.leaveType.createMany({
      data: [
        { organizationId: orgId, name: "Casual leave", annualQuota: 12, isPaid: true },
        { organizationId: orgId, name: "Sick leave", annualQuota: 6, isPaid: true },
        { organizationId: orgId, name: "Loss of pay", annualQuota: 0, isPaid: false },
      ],
    });
  }
  if ((await db.salaryComponent.count({ where: { organizationId: orgId } })) === 0) {
    await db.salaryComponent.createMany({
      data: [
        { organizationId: orgId, name: "Basic", type: "EARNING", sortOrder: 0 },
        { organizationId: orgId, name: "HRA", type: "EARNING", sortOrder: 1 },
        { organizationId: orgId, name: "Travel allowance", type: "EARNING", sortOrder: 2 },
        { organizationId: orgId, name: "Uniform deduction", type: "DEDUCTION", sortOrder: 3 },
      ],
    });
  }
  const comp = Object.fromEntries(
    (await db.salaryComponent.findMany({ where: { organizationId: orgId } })).map((c) => [c.name, c.id]),
  );
  const casual = await db.leaveType.findFirstOrThrow({ where: { organizationId: orgId, name: "Casual leave" } });

  // --- Holidays: fixed-date national holidays for this FY (add Onam, Vishu etc. in HR → Holidays) ---
  const now = new Date(Date.now() + 330 * 60_000);
  const fy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  if ((await db.holiday.count({ where: { organizationId: orgId } })) === 0) {
    await db.holiday.createMany({
      data: [
        [`${fy}-05-01`, "May Day"],
        [`${fy}-08-15`, "Independence Day"],
        [`${fy}-10-02`, "Gandhi Jayanti"],
        [`${fy}-12-25`, "Christmas"],
        [`${fy + 1}-01-26`, "Republic Day"],
      ].map(([d, name]) => ({ organizationId: orgId, date: new Date(`${d}T00:00:00.000Z`), name })),
    });
  }

  // --- Employees linked to the demo logins ---
  const fyStart = new Date(Date.UTC(fy, 3, 1));
  const staff = [
    {
      email: "manager.pkd@demo.test",
      branch: "PKD",
      d: "Management",
      g: "Branch manager",
      basic: 22000,
      hra: 6000,
      ta: 2000,
    },
    {
      email: "frontdesk.pkd@demo.test",
      branch: "PKD",
      d: "Front office",
      g: "Counsellor",
      basic: 12000,
      hra: 3000,
      ta: 1000,
    },
    { email: "trainer.pkd@demo.test", branch: "PKD", d: "Training", g: "Trainer", basic: 18000, hra: 4000, ta: 1500 },
    {
      email: "service.pkd@demo.test",
      branch: "PKD",
      d: "Service",
      g: "Service manager",
      basic: 20000,
      hra: 5000,
      ta: 1500,
    },
    {
      email: "engineer.pkd@demo.test",
      branch: "PKD",
      d: "Service",
      g: "Service engineer",
      basic: 15000,
      hra: 3500,
      ta: 1000,
      uniform: 200,
    },
    { email: "store.pkd@demo.test", branch: "PKD", d: "Service", g: "Store keeper", basic: 11000, hra: 2500, ta: 500 },
    {
      email: "manager.mkm@demo.test",
      branch: "MKM",
      d: "Management",
      g: "Branch manager",
      basic: 20000,
      hra: 5000,
      ta: 2000,
    },
    {
      email: "engineer.mkm@demo.test",
      branch: "MKM",
      d: "Service",
      g: "Service engineer",
      basic: 14000,
      hra: 3000,
      ta: 1000,
      uniform: 200,
    },
  ];
  const created: { id: string; branchId: string; email: string; name: string }[] = [];
  for (const s of staff) {
    const branchId = branchIds[s.branch];
    const userId = userIds[s.email];
    if (!branchId || !userId) continue;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const e = await db.employee.create({
      data: {
        organizationId: orgId,
        branchId,
        employeeCode: await employeeCode(db, orgId, branchId, s.branch),
        userId,
        name: user.name,
        phone: user.phone ?? "9000000000",
        email: user.email,
        departmentId: dept[s.d],
        designationId: desig[s.g],
        shiftId: shift.id,
        joinDate: new Date(fyStart.getTime() - 200 * DAY),
        salaryStructures: {
          create: {
            effectiveFrom: fyStart,
            monthlyGross: s.basic + s.hra + s.ta,
            items: {
              create: [
                { componentId: comp.Basic, amount: s.basic },
                { componentId: comp.HRA, amount: s.hra },
                { componentId: comp["Travel allowance"], amount: s.ta },
                ...(s.uniform ? [{ componentId: comp["Uniform deduction"], amount: s.uniform }] : []),
              ],
            },
          },
        },
      },
    });
    created.push({ id: e.id, branchId, email: s.email, name: user.name });
  }
  // Managers
  const pkdManager = created.find((c) => c.email === "manager.pkd@demo.test");
  const mkmManager = created.find((c) => c.email === "manager.mkm@demo.test");
  for (const c of created) {
    const manager = c.branchId === branchIds.PKD ? pkdManager : mkmManager;
    if (manager && manager.id !== c.id)
      await db.employee.update({ where: { id: c.id }, data: { managerId: manager.id } });
  }

  // --- Last month's attendance: everyone present except a few days ---
  const lastStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const holidays = new Set(
    (await db.holiday.findMany({ where: { organizationId: orgId } })).map((h) => h.date.toISOString().slice(0, 10)),
  );
  const marker = userIds["hr@demo.test"] ?? null;
  const engineer = created.find((c) => c.email === "engineer.pkd@demo.test");
  const frontDesk = created.find((c) => c.email === "frontdesk.pkd@demo.test");
  const workDays: Date[] = [];
  for (let t = lastStart.getTime(); t <= lastEnd.getTime(); t += DAY) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && !holidays.has(d.toISOString().slice(0, 10))) workDays.push(d);
  }
  const leaveDays = workDays.slice(9, 11); // two days of casual leave for the counsellor
  const absentDay = workDays[4]; // one absence for the engineer
  for (const c of created) {
    const rows = workDays.map((d) => {
      let status: "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY" = "PRESENT";
      if (c.id === engineer?.id && d.getTime() === absentDay?.getTime()) status = "ABSENT";
      if (c.id === engineer?.id && d.getTime() === workDays[15]?.getTime()) status = "HALF_DAY";
      if (c.id === frontDesk?.id && leaveDays.some((l) => l.getTime() === d.getTime())) status = "LEAVE";
      return { employeeId: c.id, date: d, status, markedById: marker };
    });
    await db.employeeAttendance.createMany({ data: rows, skipDuplicates: true });
  }
  if (frontDesk && leaveDays.length === 2) {
    await db.leaveRequest.create({
      data: {
        employeeId: frontDesk.id,
        leaveTypeId: casual.id,
        fromDate: leaveDays[0],
        toDate: leaveDays[1],
        days: 2,
        reason: "Family function",
        status: "APPROVED",
        requestedById: userIds["frontdesk.pkd@demo.test"] ?? null,
        decidedById: userIds["manager.pkd@demo.test"] ?? null,
        decidedAt: leaveDays[0],
      },
    });
    await db.leaveBalance.create({
      data: { employeeId: frontDesk.id, leaveTypeId: casual.id, year: fy, allotted: 12, used: 2 },
    });
  }

  // --- An advance and an approved incentive ---
  if (engineer) {
    const cash = await db.moneyAccount.findFirst({ where: { branchId: engineer.branchId, type: "CASH" } });
    if (cash) {
      const givenAt = new Date(lastStart.getTime() + 2 * DAY);
      const adv = await db.salaryAdvance.create({
        data: {
          employeeId: engineer.id,
          amount: 6000,
          monthlyRecovery: 2000,
          givenAt,
          moneyAccountId: cash.id,
          note: "Medical",
          createdById: marker,
        },
      });
      await db.moneyTransaction.create({
        data: {
          organizationId: orgId,
          branchId: engineer.branchId,
          moneyAccountId: cash.id,
          date: givenAt,
          direction: "OUT",
          amount: 6000,
          source: "SALARY_ADVANCE",
          refType: "SalaryAdvance",
          refId: adv.id,
          narration: `Salary advance · ${engineer.name}`,
          createdById: marker ?? userIds["arun@demo.test"],
        },
      });
    }
  }
  if (frontDesk) {
    await db.incentive.create({
      data: {
        employeeId: frontDesk.id,
        year: lastStart.getUTCFullYear(),
        month: lastStart.getUTCMonth() + 1,
        amount: 1500,
        reason: "3 admissions",
        status: "APPROVED",
        createdById: userIds["manager.pkd@demo.test"] ?? null,
        approvedById: userIds["arun@demo.test"] ?? null,
        approvedAt: new Date(),
      },
    });
  }
}
