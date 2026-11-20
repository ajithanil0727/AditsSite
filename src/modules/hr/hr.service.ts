import "server-only";
import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import { assertMoneyAccount, recordMoney } from "@/modules/accounts/money.service";
import { writeAudit } from "@/modules/audit/audit.service";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import type {
  advanceSchema,
  decisionSchema,
  employeeSchema,
  holidaySchema,
  incentiveSchema,
  leaveRequestSchema,
  salaryStructureSchema,
  staffAttendanceSchema,
} from "./hr.schemas";
import { leaveDays, leaveYear } from "./payroll-logic";

export const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const istToday = () => ymdOf(new Date(Date.now() + 330 * 60_000));

async function loadEmployee(tx: Tx | typeof db, ctx: ActionContext, id: string, permission: PermissionKey) {
  const e = await tx.employee.findFirst({ where: { id, organizationId: ctx.user.organizationId, deletedAt: null } });
  if (!e) throw new ActionError("Employee not found.");
  if (!canAccessBranch(ctx.user.access, permission, e.branchId)) throw new ActionError("This employee works in a branch you don't manage.");
  return e;
}

/** Holidays that apply to a branch (its own + organisation-wide), as YYYY-MM-DD. */
export async function holidaySet(tx: Tx | typeof db, orgId: string, branchId: string, from: Date, to: Date) {
  const rows = await tx.holiday.findMany({
    where: { organizationId: orgId, date: { gte: from, lte: to }, OR: [{ branchId: null }, { branchId }] },
    select: { date: true },
  });
  return new Set(rows.map((r) => ymdOf(r.date)));
}

/** A finalised payroll locks that month's attendance and leave for the branch. */
async function assertMonthOpen(tx: Tx | typeof db, branchId: string, date: Date) {
  const run = await tx.payrollRun.findFirst({
    where: { branchId, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, status: { in: ["FINALIZED", "PAID"] } },
  });
  if (run) throw new ActionError(`Payroll for ${date.getUTCMonth() + 1}/${date.getUTCFullYear()} is finalised; attendance and leave for that month are locked.`);
}

// ------------------------------------------------------------------ employees

export async function saveEmployee(ctx: ActionContext, input: z.output<typeof employeeSchema>) {
  const orgId = ctx.user.organizationId;
  const sensitive = can(ctx.user.access, "employees.view_sensitive");
  return db.$transaction(async (tx) => {
    if (!canAccessBranch(ctx.user.access, input.id ? "employees.update" : "employees.create", input.branchId))
      throw new ActionError("You can't manage employees of this branch.");
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } });
    if (!branch) throw new ActionError("Branch not found.");
    if (input.userId) {
      const taken = await tx.employee.findFirst({ where: { userId: input.userId, ...(input.id ? { id: { not: input.id } } : {}) } });
      if (taken) throw new ActionError("That login is already linked to another employee.");
    }
    if (input.managerId && input.managerId === input.id) throw new ActionError("Someone can't report to themselves.");
    const data = {
      branchId: input.branchId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      dob: input.dob ? dateOnly(input.dob) : null,
      gender: input.gender,
      address: input.address,
      departmentId: input.departmentId,
      designationId: input.designationId,
      managerId: input.managerId,
      shiftId: input.shiftId,
      userId: input.userId,
      joinDate: dateOnly(input.joinDate),
      exitDate: input.exitDate ? dateOnly(input.exitDate) : null,
      status: input.status,
      ...(sensitive ? { pan: input.pan, bankName: input.bankName, bankAccountNo: input.bankAccountNo, ifsc: input.ifsc } : {}),
    };
    if (!input.id) {
      const employeeCode = await nextDocNumber(tx, { branchId: branch.id, docType: "EMPLOYEE_ID" });
      const e = await tx.employee.create({ data: { ...data, organizationId: orgId, employeeCode } });
      await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Employee", entityId: e.id, branchId: e.branchId, after: e });
      return e.id;
    }
    const before = await loadEmployee(tx, ctx, input.id, "employees.update");
    const after = await tx.employee.update({ where: { id: before.id }, data });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Employee", entityId: before.id, branchId: after.branchId, before, after });
    return before.id;
  });
}

export async function setEmployeeDeleted(ctx: ActionContext, id: string, deleted: boolean) {
  await db.$transaction(async (tx) => {
    const e = await tx.employee.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
    if (!e || !canAccessBranch(ctx.user.access, "employees.delete", e.branchId)) throw new ActionError("Employee not found.");
    await tx.employee.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    await writeAudit(tx, ctx.actor, { action: deleted ? "DELETE" : "RESTORE", entityType: "Employee", entityId: id, branchId: e.branchId });
  });
}

export async function addEmployeeDocument(ctx: ActionContext, employeeId: string, fileId: string, label: string) {
  await db.$transaction(async (tx) => {
    const e = await loadEmployee(tx, ctx, employeeId, "employees.update");
    const f = await tx.fileAsset.findFirst({ where: { id: fileId, organizationId: ctx.user.organizationId, deletedAt: null } });
    if (!f) throw new ActionError("Upload not found. Try again.");
    await tx.attachment.create({ data: { fileId: f.id, entityType: "Employee", entityId: e.id, label } });
    await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "EmployeeDocument", entityId: e.id, branchId: e.branchId, after: { label, file: f.originalName } });
  });
}

export async function saveSalaryStructure(ctx: ActionContext, input: z.output<typeof salaryStructureSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadEmployee(tx, ctx, input.employeeId, "payroll.run");
    const comps = await tx.salaryComponent.findMany({
      where: { id: { in: input.items.map((i) => i.componentId) }, organizationId: ctx.user.organizationId },
    });
    if (comps.length !== input.items.length) throw new ActionError("A salary component was not found.");
    const earnings = input.items.filter((i) => comps.find((c) => c.id === i.componentId)?.type === "EARNING");
    const gross = earnings.reduce((a, i) => a + i.amount, 0);
    if (gross <= 0) throw new ActionError("Add at least one earning (e.g. Basic).");
    const from = dateOnly(input.effectiveFrom);
    const locked = await tx.payrollRun.findFirst({
      where: { branchId: e.branchId, status: { in: ["FINALIZED", "PAID"] }, OR: [{ year: { gt: from.getUTCFullYear() } }, { year: from.getUTCFullYear(), month: { gte: from.getUTCMonth() + 1 } }] },
    });
    if (locked) throw new ActionError(`Payroll for ${locked.month}/${locked.year} is finalised. A new salary must start after that month.`);
    const s = await tx.salaryStructure.create({
      data: {
        employeeId: e.id,
        effectiveFrom: from,
        monthlyGross: Math.round(gross * 100) / 100,
        notes: input.notes,
        items: { create: input.items.map((i) => ({ componentId: i.componentId, amount: i.amount })) },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "SalaryStructure",
      entityId: s.id,
      branchId: e.branchId,
      after: { employee: e.employeeCode, from: input.effectiveFrom, gross, items: input.items },
    });
  });
}

// ------------------------------------------------------------------ holidays

export async function saveHoliday(ctx: ActionContext, input: z.output<typeof holidaySchema>) {
  const orgId = ctx.user.organizationId;
  if (input.branchId) {
    const b = await db.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } });
    if (!b) throw new ActionError("Branch not found.");
  }
  await db.$transaction(async (tx) => {
    const data = { date: dateOnly(input.date), name: input.name, branchId: input.branchId };
    if (input.id) {
      const before = await tx.holiday.findFirst({ where: { id: input.id, organizationId: orgId } });
      if (!before) throw new ActionError("Holiday not found.");
      await tx.holiday.update({ where: { id: input.id }, data });
      await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Holiday", entityId: input.id, before, after: data });
    } else {
      const h = await tx.holiday.create({ data: { ...data, organizationId: orgId } });
      await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Holiday", entityId: h.id, after: h });
    }
  });
}

export async function deleteHoliday(ctx: ActionContext, id: string) {
  const h = await db.holiday.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
  if (!h) throw new ActionError("Holiday not found.");
  await db.holiday.delete({ where: { id } });
  await writeAudit(db, ctx.actor, { action: "DELETE", entityType: "Holiday", entityId: id, before: h });
}

// ------------------------------------------------------------------ attendance

export async function saveStaffAttendance(ctx: ActionContext, input: z.output<typeof staffAttendanceSchema>) {
  if (!canAccessBranch(ctx.user.access, "hr_attendance.mark", input.branchId)) throw new ActionError("You can't mark attendance for this branch.");
  if (input.date > istToday()) throw new ActionError("You can't mark attendance for a future date.");
  const date = dateOnly(input.date);
  await db.$transaction(async (tx) => {
    await assertMonthOpen(tx, input.branchId, date);
    const staff = await tx.employee.findMany({
      where: {
        id: { in: input.records.map((r) => r.employeeId) },
        organizationId: ctx.user.organizationId,
        branchId: input.branchId,
        deletedAt: null,
        joinDate: { lte: date },
        OR: [{ exitDate: null }, { exitDate: { gte: date } }],
      },
      select: { id: true },
    });
    if (staff.length !== input.records.length) throw new ActionError("Someone in the list isn't on this branch's staff on that date.");
    for (const r of input.records) {
      await tx.employeeAttendance.upsert({
        where: { employeeId_date: { employeeId: r.employeeId, date } },
        create: { employeeId: r.employeeId, date, status: r.status, note: r.note, markedById: ctx.user.id },
        update: { status: r.status, note: r.note, markedById: ctx.user.id },
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "StaffAttendance",
      entityId: input.branchId,
      branchId: input.branchId,
      after: { date: input.date, marked: input.records.length, absent: input.records.filter((r) => r.status === "ABSENT").length },
    });
  });
}

// ------------------------------------------------------------------ leave

async function balanceFor(tx: Tx, employeeId: string, leaveTypeId: string, year: number) {
  const type = await tx.leaveType.findUniqueOrThrow({ where: { id: leaveTypeId } });
  const row = await tx.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } });
  return { type, allotted: Number(row?.allotted ?? type.annualQuota), used: Number(row?.used ?? 0) };
}

export async function requestLeave(ctx: ActionContext, input: z.output<typeof leaveRequestSchema>) {
  const orgId = ctx.user.organizationId;
  return db.$transaction(async (tx) => {
    const e = await tx.employee.findFirst({ where: { id: input.employeeId, organizationId: orgId, deletedAt: null } });
    if (!e) throw new ActionError("Employee not found.");
    const own = e.userId === ctx.user.id;
    if (!own && !canAccessBranch(ctx.user.access, "leaves.approve", e.branchId))
      throw new ActionError("You can only apply for your own leave.");
    const type = await tx.leaveType.findFirst({ where: { id: input.leaveTypeId, organizationId: orgId, isActive: true } });
    if (!type) throw new ActionError("Pick a leave type.");
    const from = dateOnly(input.fromDate);
    const to = dateOnly(input.toDate);
    if (leaveYear(from) !== leaveYear(to)) throw new ActionError("Split leave that crosses 31 March into two requests.");
    const { days } = leaveDays(from, to, await holidaySet(tx, orgId, e.branchId, from, to));
    if (days === 0) throw new ActionError("Those dates are all Sundays or holidays.");
    const overlap = await tx.leaveRequest.findFirst({
      where: { employeeId: e.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: to }, toDate: { gte: from } },
    });
    if (overlap) throw new ActionError("There's already a leave request for some of these dates.");
    if (type.isPaid) {
      const bal = await balanceFor(tx, e.id, type.id, leaveYear(from));
      if (days > bal.allotted - bal.used) throw new ActionError(`Only ${bal.allotted - bal.used} day(s) of ${type.name} left this year.`);
    }
    const req = await tx.leaveRequest.create({
      data: { employeeId: e.id, leaveTypeId: type.id, fromDate: from, toDate: to, days, reason: input.reason, requestedById: ctx.user.id },
    });
    await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "LeaveRequest", entityId: req.id, branchId: e.branchId, after: req });
    return req.id;
  });
}

export async function decideLeave(ctx: ActionContext, input: z.output<typeof decisionSchema>) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findFirst({ where: { id: input.id, employee: { organizationId: orgId } }, include: { employee: true, leaveType: true } });
    if (!req) throw new ActionError("Leave request not found.");
    if (!canAccessBranch(ctx.user.access, "leaves.approve", req.employee.branchId)) throw new ActionError("Not your branch.");
    if (req.status !== "PENDING") throw new ActionError("This request was already decided.");
    if (req.requestedById === ctx.user.id || req.employee.userId === ctx.user.id) throw new ActionError("You can't approve your own leave.");
    if (input.approve) {
      const holidays = await holidaySet(tx, orgId, req.employee.branchId, req.fromDate, req.toDate);
      const { days, dates } = leaveDays(req.fromDate, req.toDate, holidays);
      for (const ymd of dates) await assertMonthOpen(tx, req.employee.branchId, dateOnly(ymd));
      const year = leaveYear(req.fromDate);
      if (req.leaveType.isPaid) {
        const bal = await balanceFor(tx, req.employeeId, req.leaveTypeId, year);
        if (days > bal.allotted - bal.used) throw new ActionError(`Only ${bal.allotted - bal.used} day(s) of ${req.leaveType.name} left.`);
      }
      await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year } },
        create: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year, allotted: req.leaveType.annualQuota, used: days },
        update: { used: { increment: days } },
      });
      for (const ymd of dates) {
        const date = dateOnly(ymd);
        await tx.employeeAttendance.upsert({
          where: { employeeId_date: { employeeId: req.employeeId, date } },
          create: { employeeId: req.employeeId, date, status: "LEAVE", note: req.leaveType.name, markedById: ctx.user.id },
          update: { status: "LEAVE", note: req.leaveType.name, markedById: ctx.user.id },
        });
      }
    }
    await tx.leaveRequest.update({
      where: { id: req.id },
      data: { status: input.approve ? "APPROVED" : "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: input.note },
    });
    await writeAudit(tx, ctx.actor, {
      action: input.approve ? "APPROVE" : "REJECT",
      entityType: "LeaveRequest",
      entityId: req.id,
      branchId: req.employee.branchId,
      before: { status: "PENDING" },
      after: { status: input.approve ? "APPROVED" : "REJECTED", note: input.note },
    });
  });
}

/** Withdraw a pending request, or cancel an approved one (gives the days back, clears the leave marks). */
export async function cancelLeave(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findFirst({ where: { id, employee: { organizationId: ctx.user.organizationId } }, include: { employee: true } });
    if (!req) throw new ActionError("Leave request not found.");
    const approver = canAccessBranch(ctx.user.access, "leaves.approve", req.employee.branchId);
    const own = req.requestedById === ctx.user.id || req.employee.userId === ctx.user.id;
    if (req.status === "PENDING" ? !own && !approver : !approver) throw new ActionError("You can't cancel this request.");
    if (req.status !== "PENDING" && req.status !== "APPROVED") throw new ActionError("This request is already closed.");
    if (req.status === "APPROVED") {
      const holidays = await holidaySet(tx, ctx.user.organizationId, req.employee.branchId, req.fromDate, req.toDate);
      const { days, dates } = leaveDays(req.fromDate, req.toDate, holidays);
      for (const ymd of dates) await assertMonthOpen(tx, req.employee.branchId, dateOnly(ymd));
      await tx.leaveBalance.updateMany({
        where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: leaveYear(req.fromDate) },
        data: { used: { decrement: days } },
      });
      await tx.employeeAttendance.deleteMany({
        where: { employeeId: req.employeeId, status: "LEAVE", date: { in: dates.map(dateOnly) } },
      });
    }
    await tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", decidedById: ctx.user.id, decidedAt: new Date() } });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "LeaveRequest", entityId: id, branchId: req.employee.branchId, before: { status: req.status }, after: { status: "CANCELLED" } });
  });
}

// ------------------------------------------------------------------ advances & incentives

export async function giveAdvance(ctx: ActionContext, input: z.output<typeof advanceSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadEmployee(tx, ctx, input.employeeId, "advances.manage");
    await assertMoneyAccount(tx, input.moneyAccountId, e.branchId);
    const a = await tx.salaryAdvance.create({
      data: {
        employeeId: e.id,
        amount: input.amount,
        monthlyRecovery: input.monthlyRecovery,
        givenAt: dateOnly(input.givenAt),
        moneyAccountId: input.moneyAccountId,
        note: input.note,
        createdById: ctx.user.id,
      },
    });
    await recordMoney(tx, {
      organizationId: e.organizationId,
      branchId: e.branchId,
      moneyAccountId: input.moneyAccountId,
      date: a.givenAt,
      direction: "OUT",
      amount: input.amount,
      source: "SALARY_ADVANCE",
      refType: "SalaryAdvance",
      refId: a.id,
      narration: `Salary advance · ${e.name} (${e.employeeCode})`,
      createdById: ctx.user.id,
    });
    await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "SalaryAdvance", entityId: a.id, branchId: e.branchId, after: a });
  });
}

export async function addIncentive(ctx: ActionContext, input: z.output<typeof incentiveSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadEmployee(tx, ctx, input.employeeId, "incentives.manage");
    const locked = await tx.payrollRun.findFirst({ where: { branchId: e.branchId, year: input.year, month: input.month, status: { in: ["FINALIZED", "PAID"] } } });
    if (locked) throw new ActionError("Payroll for that month is finalised. Add it to the next month.");
    const i = await tx.incentive.create({
      data: { employeeId: e.id, year: input.year, month: input.month, amount: input.amount, reason: input.reason, source: "MANUAL", createdById: ctx.user.id },
    });
    await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Incentive", entityId: i.id, branchId: e.branchId, after: i });
  });
}

export async function decideIncentive(ctx: ActionContext, input: z.output<typeof decisionSchema>) {
  await db.$transaction(async (tx) => {
    const i = await tx.incentive.findFirst({ where: { id: input.id, employee: { organizationId: ctx.user.organizationId } }, include: { employee: true } });
    if (!i) throw new ActionError("Incentive not found.");
    if (!canAccessBranch(ctx.user.access, "incentives.approve", i.employee.branchId)) throw new ActionError("Not your branch.");
    if (i.status !== "PENDING") throw new ActionError("Already decided.");
    if (i.createdById === ctx.user.id || i.employee.userId === ctx.user.id) throw new ActionError("You can't approve an incentive you entered or one for yourself.");
    await tx.incentive.update({
      where: { id: i.id },
      data: { status: input.approve ? "APPROVED" : "REJECTED", approvedById: ctx.user.id, approvedAt: new Date() },
    });
    await writeAudit(tx, ctx.actor, {
      action: input.approve ? "APPROVE" : "REJECT",
      entityType: "Incentive",
      entityId: i.id,
      branchId: i.employee.branchId,
      before: { status: "PENDING" },
      after: { status: input.approve ? "APPROVED" : "REJECTED" },
    });
  });
}
