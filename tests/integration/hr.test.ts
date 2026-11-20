/**
 * Integration test (real database) for Phase 6: leave approval + balance, attendance marks,
 * payroll build → finalise → pay, advance recovery, incentives and salaries in the P&L.
 * Uses March 2021 at Mukkam with a test employee, so the demo staff (joined later) don't interfere.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { pnlReport } from "@/modules/accounts/pnl.queries";
import {
  addIncentive,
  decideIncentive,
  decideLeave,
  giveAdvance,
  requestLeave,
  saveSalaryStructure,
  saveStaffAttendance,
} from "@/modules/hr/hr.service";
import { buildPayroll, finalizePayroll, payPayroll } from "@/modules/hr/payroll.service";
import { buildAccess } from "@/modules/rbac/access";
import type { ActionContext } from "@/modules/rbac/action";

const hasDb = !!process.env.DATABASE_URL;
const CODE = "MKM-TEST-HR";

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
  const e = await db.employee.findFirst({ where: { employeeCode: CODE } });
  if (!e) return;
  const runs = await db.payrollRun.findMany({
    where: { payslips: { some: { employeeId: e.id } } },
    include: { payslips: true },
  });
  const advances = await db.salaryAdvance.findMany({ where: { employeeId: e.id } });
  await db.moneyTransaction.deleteMany({
    where: { refId: { in: [...runs.flatMap((r) => r.payslips.map((s) => s.id)), ...advances.map((a) => a.id)] } },
  });
  await db.incentive.deleteMany({ where: { employeeId: e.id } });
  await db.payrollRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
  await db.salaryAdvance.deleteMany({ where: { employeeId: e.id } });
  await db.employeeAttendance.deleteMany({ where: { employeeId: e.id } });
  await db.leaveRequest.deleteMany({ where: { employeeId: e.id } });
  await db.leaveBalance.deleteMany({ where: { employeeId: e.id } });
  await db.salaryStructure.deleteMany({ where: { employeeId: e.id } });
  await db.employee.delete({ where: { id: e.id } });
}

describe.skipIf(!hasDb)("hr and payroll", () => {
  let owner: ActionContext;
  let hr: ActionContext;
  let ids: { mkm: string; emp: string; casual: string; basic: string; cash: string };

  beforeAll(async () => {
    await cleanup();
    owner = await ctxFor("arun@demo.test");
    hr = await ctxFor("hr@demo.test");
    const mkm = await db.branch.findFirstOrThrow({ where: { code: "MKM" } });
    const emp = await db.employee.create({
      data: {
        organizationId: mkm.organizationId,
        branchId: mkm.id,
        employeeCode: CODE,
        name: "Test Employee",
        phone: "9000000099",
        joinDate: new Date("2021-01-01T00:00:00Z"),
      },
    });
    ids = {
      mkm: mkm.id,
      emp: emp.id,
      casual: (await db.leaveType.findFirstOrThrow({ where: { name: "Casual leave" } })).id,
      basic: (await db.salaryComponent.findFirstOrThrow({ where: { name: "Basic" } })).id,
      cash: (await db.moneyAccount.findFirstOrThrow({ where: { branchId: mkm.id, type: "CASH" } })).id,
    };
  });

  afterAll(cleanup);

  it("approves leave: balance goes down, days are marked as leave, own approval refused", async () => {
    // HR applies on the employee's behalf: Tue 2 – Wed 3 March 2021 = 2 days.
    const id = await requestLeave(hr, {
      employeeId: ids.emp,
      leaveTypeId: ids.casual,
      fromDate: "2021-03-02",
      toDate: "2021-03-03",
      reason: null,
    });
    await expect(decideLeave(hr, { id, approve: true, note: null })).rejects.toThrow(/own/);
    await decideLeave(owner, { id, approve: true, note: null });
    const bal = await db.leaveBalance.findFirstOrThrow({
      where: { employeeId: ids.emp, leaveTypeId: ids.casual, year: 2020 },
    });
    expect(Number(bal.used)).toBe(2);
    const marks = await db.employeeAttendance.findMany({ where: { employeeId: ids.emp, status: "LEAVE" } });
    expect(marks).toHaveLength(2);
    // Overlapping request refused.
    await expect(
      requestLeave(hr, {
        employeeId: ids.emp,
        leaveTypeId: ids.casual,
        fromDate: "2021-03-03",
        toDate: "2021-03-03",
        reason: null,
      }),
    ).rejects.toThrow(/already/);
  });

  it("works out, finalises and pays the month", async () => {
    await saveSalaryStructure(hr, {
      employeeId: ids.emp,
      effectiveFrom: "2021-03-01",
      items: [{ componentId: ids.basic, amount: 31000 }],
      notes: null,
    });
    // Absent on Thu 4 March; the rest stays unmarked (counted present).
    await saveStaffAttendance(hr, {
      branchId: ids.mkm,
      date: "2021-03-04",
      records: [{ employeeId: ids.emp, status: "ABSENT", note: null }],
    });
    await giveAdvance(hr, {
      employeeId: ids.emp,
      amount: 3000,
      monthlyRecovery: 1000,
      givenAt: "2021-03-01",
      moneyAccountId: ids.cash,
      note: null,
    });
    await addIncentive(hr, { employeeId: ids.emp, year: 2021, month: 3, amount: 500, reason: "Test target" });
    const inc = await db.incentive.findFirstOrThrow({ where: { employeeId: ids.emp } });
    await expect(decideIncentive(hr, { id: inc.id, approve: true, note: null })).rejects.toThrow();
    await decideIncentive(owner, { id: inc.id, approve: true, note: null });

    await buildPayroll(hr, { branchId: ids.mkm, year: 2021, month: 3 });
    const run = await db.payrollRun.findFirstOrThrow({ where: { branchId: ids.mkm, year: 2021, month: 3 } });
    const slip = await db.payslip.findFirstOrThrow({ where: { payrollRunId: run.id, employeeId: ids.emp } });
    // 31 days, 1 absent → 30 paid days; 31,000 − 1,000 LOP + 500 incentive − 1,000 advance = 29,500.
    expect(slip.daysInMonth).toBe(31);
    expect(Number(slip.paidDays)).toBe(30);
    expect(Number(slip.lopAmount)).toBe(1000);
    expect(Number(slip.incentives)).toBe(500);
    expect(Number(slip.advanceRecovery)).toBe(1000);
    expect(Number(slip.netPay)).toBe(29500);

    await finalizePayroll(hr, run.id);
    const adv = await db.salaryAdvance.findFirstOrThrow({ where: { employeeId: ids.emp } });
    expect(Number(adv.recoveredAmount)).toBe(1000);
    expect((await db.incentive.findUniqueOrThrow({ where: { id: inc.id } })).payslipId).toBe(slip.id);
    // The month is locked now.
    await expect(
      saveStaffAttendance(hr, {
        branchId: ids.mkm,
        date: "2021-03-05",
        records: [{ employeeId: ids.emp, status: "ABSENT", note: null }],
      }),
    ).rejects.toThrow();
    await expect(buildPayroll(hr, { branchId: ids.mkm, year: 2021, month: 3 })).rejects.toThrow(/finalised/);

    await payPayroll(hr, { runId: run.id, moneyAccountId: ids.cash, paidOn: "2021-04-02" });
    const entry = await db.moneyTransaction.findFirstOrThrow({ where: { refId: slip.id } });
    expect(entry.source).toBe("PAYROLL");
    expect(Number(entry.amount)).toBe(29500);
    expect((await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("PAID");
  });

  it("counts the salary cost in the month it is for", async () => {
    const salaries = (pnl: { lines: { key: string; amount: number }[] }) =>
      pnl.lines.find((l) => l.key === "salaries")?.amount ?? 0;
    const r = await pnlReport(owner.user, { from: "2021-03-01", to: "2021-03-31", activeBranchId: null });
    const mkm = r.branches.find((b) => b.id === ids.mkm)!;
    expect(salaries(mkm.pnl)).toBe(30500_00); // 31,000 − 1,000 LOP + 500 incentive; the advance isn't a cost
    const april = await pnlReport(owner.user, { from: "2021-04-01", to: "2021-04-30", activeBranchId: null });
    expect(salaries(april.branches.find((b) => b.id === ids.mkm)!.pnl)).toBe(0);
  });
});
