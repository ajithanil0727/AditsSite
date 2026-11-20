import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assertMoneyAccount, recordMoney } from "@/modules/accounts/money.service";
import { writeAudit } from "@/modules/audit/audit.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { paiseToDecimalString, rupeesToPaise } from "@/modules/tax/gst";
import type { payrollPaySchema, payrollRunSchema } from "./hr.schemas";
import { holidaySet, dateOnly } from "./hr.service";
import { computePayslip, daysInMonth, leaveDays, summarizeMonth, type Mark } from "./payroll-logic";

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const p = (v: Prisma.Decimal | number | null | undefined) => rupeesToPaise(Number(v ?? 0));

/**
 * Work out (or re-work) a branch's payroll for a month as a draft. Employees without a salary
 * structure are skipped and listed. Re-running a draft replaces its payslips.
 */
export async function buildPayroll(ctx: ActionContext, input: z.output<typeof payrollRunSchema>) {
  const orgId = ctx.user.organizationId;
  if (!canAccessBranch(ctx.user.access, "payroll.run", input.branchId)) throw new ActionError("You can't run payroll for this branch.");
  const start = new Date(Date.UTC(input.year, input.month - 1, 1));
  const end = new Date(Date.UTC(input.year, input.month, 0));
  const today = new Date(Date.now() + 330 * 60_000);
  if (start > today) throw new ActionError("That month hasn't started yet.");

  return db.$transaction(
    async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } });
      if (!branch) throw new ActionError("Branch not found.");
      let run = await tx.payrollRun.findUnique({ where: { branchId_year_month: { branchId: branch.id, year: input.year, month: input.month } } });
      if (run && run.status !== "DRAFT") throw new ActionError("This month's payroll is already finalised.");
      if (!run) run = await tx.payrollRun.create({ data: { organizationId: orgId, branchId: branch.id, year: input.year, month: input.month } });
      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });

      const employees = await tx.employee.findMany({
        where: {
          organizationId: orgId,
          branchId: branch.id,
          deletedAt: null,
          joinDate: { lte: end },
          OR: [{ exitDate: null }, { exitDate: { gte: start } }],
        },
        include: {
          salaryStructures: {
            where: { effectiveFrom: { lte: end } },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
            include: { items: { include: { component: true } } },
          },
        },
        orderBy: { name: "asc" },
      });
      const holidays = await holidaySet(tx, orgId, branch.id, start, end);
      const skipped: string[] = [];
      let made = 0;

      for (const e of employees) {
        const structure = e.salaryStructures[0];
        if (!structure) {
          skipped.push(e.name);
          continue;
        }
        const [marks, leaves, incentives, advances] = await Promise.all([
          tx.employeeAttendance.findMany({ where: { employeeId: e.id, date: { gte: start, lte: end } } }),
          tx.leaveRequest.findMany({
            where: { employeeId: e.id, status: "APPROVED", leaveType: { isPaid: true }, fromDate: { lte: end }, toDate: { gte: start } },
          }),
          tx.incentive.findMany({ where: { employeeId: e.id, year: input.year, month: input.month, status: "APPROVED", payslipId: null } }),
          tx.salaryAdvance.findMany({ where: { employeeId: e.id, status: "OPEN", givenAt: { lte: end } }, orderBy: { givenAt: "asc" } }),
        ]);
        const paidLeave = new Set<string>();
        for (const l of leaves) leaveDays(l.fromDate, l.toDate, holidays).dates.forEach((d) => paidLeave.add(d));
        const summary = summarizeMonth({
          year: input.year,
          month: input.month,
          joinDate: e.joinDate,
          exitDate: e.exitDate,
          marks: new Map(marks.map((m) => [ymdOf(m.date), m.status as Mark])),
          holidays,
          paidLeaveDates: paidLeave,
        });
        const outstanding = advances.reduce((a, x) => a + p(x.amount) - p(x.recoveredAmount), 0);
        const monthly = advances.reduce((a, x) => a + p(x.monthlyRecovery), 0);
        const slip = computePayslip({
          earnings: structure.items.filter((i) => i.component.type === "EARNING").map((i) => ({ componentId: i.componentId, label: i.component.name, amount: p(i.amount) })),
          deductions: structure.items.filter((i) => i.component.type === "DEDUCTION").map((i) => ({ componentId: i.componentId, label: i.component.name, amount: p(i.amount) })),
          daysInMonth: daysInMonth(input.year, input.month),
          paidDays: summary.paidDays,
          incentives: incentives.reduce((a, i) => a + p(i.amount), 0),
          advance: outstanding > 0 ? { outstanding, monthlyRecovery: monthly } : null,
        });
        await tx.payslip.create({
          data: {
            payrollRunId: run.id,
            employeeId: e.id,
            daysInMonth: summary.daysInMonth,
            paidDays: summary.paidDays,
            lopDays: summary.lopDays,
            grossEarnings: paiseToDecimalString(slip.grossFull),
            lopAmount: paiseToDecimalString(slip.lopAmount),
            incentives: paiseToDecimalString(slip.incentives),
            otherDeductions: paiseToDecimalString(slip.deductionsTotal),
            advanceRecovery: paiseToDecimalString(slip.advanceRecovery),
            netPay: paiseToDecimalString(slip.netPay),
            summary: summary as unknown as Prisma.InputJsonValue,
            items: {
              create: [
                ...slip.earnings.map((l) => ({ componentId: l.componentId, label: l.label, type: "EARNING" as const, amount: paiseToDecimalString(l.amount) })),
                ...slip.deductions.map((l) => ({ componentId: l.componentId, label: l.label, type: "DEDUCTION" as const, amount: paiseToDecimalString(l.amount) })),
              ],
            },
          },
        });
        made++;
      }
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "PayrollRun",
        entityId: run.id,
        branchId: branch.id,
        after: { month: `${input.month}/${input.year}`, payslips: made, skipped },
      });
      return { id: run.id, skipped };
    },
    { timeout: 30_000 },
  );
}

/** Lock the month: incentives are tied to the payslips, advance recoveries applied, attendance locked. */
export async function finalizePayroll(ctx: ActionContext, runId: string) {
  await db.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, organizationId: ctx.user.organizationId },
        include: { payslips: { include: { employee: true } } },
      });
      if (!run) throw new ActionError("Payroll not found.");
      if (!canAccessBranch(ctx.user.access, "payroll.finalize", run.branchId)) throw new ActionError("Not your branch.");
      if (run.status !== "DRAFT") throw new ActionError("Already finalised.");
      if (run.payslips.length === 0) throw new ActionError("There are no payslips. Work out the payroll first.");
      for (const s of run.payslips) {
        await tx.incentive.updateMany({
          where: { employeeId: s.employeeId, year: run.year, month: run.month, status: "APPROVED", payslipId: null },
          data: { payslipId: s.id },
        });
        let left = p(s.advanceRecovery);
        if (left > 0) {
          const advances = await tx.salaryAdvance.findMany({ where: { employeeId: s.employeeId, status: "OPEN" }, orderBy: { givenAt: "asc" } });
          for (const a of advances) {
            if (left <= 0) break;
            const due = p(a.amount) - p(a.recoveredAmount);
            const take = Math.min(due, left);
            left -= take;
            const recovered = p(a.recoveredAmount) + take;
            await tx.salaryAdvance.update({
              where: { id: a.id },
              data: { recoveredAmount: paiseToDecimalString(recovered), status: recovered >= p(a.amount) ? "CLOSED" : "OPEN" },
            });
          }
        }
      }
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: "FINALIZED", finalizedById: ctx.user.id, finalizedAt: new Date() } });
      await writeAudit(tx, ctx.actor, {
        action: "APPROVE",
        entityType: "PayrollRun",
        entityId: run.id,
        branchId: run.branchId,
        before: { status: "DRAFT" },
        after: { status: "FINALIZED", net: run.payslips.reduce((a, s) => a + Number(s.netPay), 0) },
      });
    },
    { timeout: 30_000 },
  );
}

/** Pay all unpaid payslips of a finalised run from one account (day book: one entry per person). */
export async function payPayroll(ctx: ActionContext, input: z.output<typeof payrollPaySchema>) {
  await db.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: input.runId, organizationId: ctx.user.organizationId },
        include: { payslips: { where: { paidAt: null }, include: { employee: true } } },
      });
      if (!run) throw new ActionError("Payroll not found.");
      if (!canAccessBranch(ctx.user.access, "payroll.mark_paid", run.branchId)) throw new ActionError("Not your branch.");
      if (run.status !== "FINALIZED") throw new ActionError(run.status === "PAID" ? "Already paid." : "Finalise the payroll first.");
      await assertMoneyAccount(tx, input.moneyAccountId, run.branchId);
      const paidOn = dateOnly(input.paidOn);
      for (const s of run.payslips) {
        if (Number(s.netPay) > 0) {
          await recordMoney(tx, {
            organizationId: run.organizationId,
            branchId: run.branchId,
            moneyAccountId: input.moneyAccountId,
            date: paidOn,
            direction: "OUT",
            amount: Number(s.netPay),
            source: "PAYROLL",
            refType: "Payslip",
            refId: s.id,
            narration: `Salary ${run.month}/${run.year} · ${s.employee.name} (${s.employee.employeeCode})`,
            createdById: ctx.user.id,
          });
        }
        await tx.payslip.update({ where: { id: s.id }, data: { paidAt: paidOn, moneyAccountId: input.moneyAccountId } });
      }
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: "PAID" } });
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "PayrollRun",
        entityId: run.id,
        branchId: run.branchId,
        before: { status: "FINALIZED" },
        after: { status: "PAID", paidOn: input.paidOn, payslips: run.payslips.length },
      });
    },
    { timeout: 30_000 },
  );
}

export async function deletePayrollDraft(ctx: ActionContext, runId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, organizationId: ctx.user.organizationId } });
  if (!run || !canAccessBranch(ctx.user.access, "payroll.run", run.branchId)) throw new ActionError("Payroll not found.");
  if (run.status !== "DRAFT") throw new ActionError("A finalised payroll can't be deleted.");
  await db.payrollRun.delete({ where: { id: runId } });
  await writeAudit(db, ctx.actor, { action: "DELETE", entityType: "PayrollRun", entityId: runId, branchId: run.branchId, before: run });
}
