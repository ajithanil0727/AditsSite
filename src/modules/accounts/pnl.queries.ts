import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint } from "@/modules/rbac/access";
import { rupeesToPaise } from "@/modules/tax/gst";
import { salaryCost } from "@/modules/hr/payroll-logic";
import { computePnl, EMPTY_FIGURES, expenseCost, sumFigures, type BranchFigures, type Pnl } from "./pnl-logic";

const DAY = 86_400_000;
/** "YYYY-MM-DD" → that calendar date (Postgres DATE columns). */
export const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
/** IST day bounds for timestamp columns: [start of `from`, start of the day after `to`). */
export const istRange = (from: string, to: string) => ({
  gte: new Date(`${from}T00:00:00.000+05:30`),
  lt: new Date(new Date(`${to}T00:00:00.000+05:30`).getTime() + DAY),
});
const p = (v: Prisma.Decimal | number | string | null | undefined) => rupeesToPaise(Number(v ?? 0));

export type BranchRef = { id: string; code: string; name: string; registered: boolean };

/** Income and cost figures per branch for [from, to] (inclusive IST dates). See pnl-logic.ts for the rules. */
export async function branchFigures(orgId: string, branchIds: string[], from: string, to: string) {
  const range = istRange(from, to);
  const dateRange = { gte: dateOnly(from), lte: dateOnly(to) };
  const inBranches = { in: branchIds };

  const [branches, fees, refunds, invoices, credits, incomes, stock, expenses] = await Promise.all([
    db.branch.findMany({
      where: { id: inBranches, organizationId: orgId },
      select: { id: true, code: true, name: true, gstRegistrationId: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.feePayment.groupBy({
      by: ["branchId"],
      where: { organizationId: orgId, branchId: inBranches, cancelledAt: null, paidAt: range },
      _sum: { amount: true },
    }),
    db.feeRefund.groupBy({
      by: ["branchId"],
      where: { organizationId: orgId, branchId: inBranches, paidAt: range },
      _sum: { amount: true },
    }),
    db.invoice.groupBy({
      by: ["branchId"],
      where: {
        organizationId: orgId,
        branchId: inBranches,
        status: "ISSUED",
        kind: { in: ["TAX_INVOICE", "BILL_OF_SUPPLY", "NON_GST_INVOICE"] },
        jobCardId: { not: null },
        invoiceDate: dateRange,
      },
      _sum: { grandTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true },
    }),
    db.invoice.groupBy({
      by: ["branchId"],
      where: {
        organizationId: orgId,
        branchId: inBranches,
        status: "ISSUED",
        kind: "CREDIT_NOTE",
        invoiceDate: dateRange,
      },
      _sum: { grandTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true },
    }),
    db.income.groupBy({
      by: ["branchId", "categoryId"],
      where: { organizationId: orgId, branchId: inBranches, deletedAt: null, date: dateRange },
      _sum: { amount: true },
    }),
    // Stock value moved, per branch and movement type (qty is signed: issues are negative).
    db.$queryRaw<{ branchId: string; type: string; value: Prisma.Decimal | null }[]>`
      SELECT "branchId", "type"::text AS "type", SUM("qty" * "unitCost") AS "value"
      FROM "StockMovement"
      WHERE "organizationId" = ${orgId}
        AND "branchId" IN (${Prisma.join(branchIds.length ? branchIds : ["-"])})
        AND "type" IN ('JOB_ISSUE', 'JOB_RETURN', 'INTERNAL_USE', 'ADJUSTMENT_OUT')
        AND "createdAt" >= ${range.gte} AND "createdAt" < ${range.lt}
      GROUP BY "branchId", "type"`,
    db.expense.groupBy({
      by: ["branchId", "categoryId"],
      where: { organizationId: orgId, branchId: inBranches, deletedAt: null, status: "APPROVED", date: dateRange },
      _sum: { amount: true, gstAmount: true },
    }),
  ]);

  // Salaries: payroll months whose last day falls in the period (finalised or paid runs).
  const months: { year: number; month: number }[] = [];
  for (
    let d = new Date(dateOnly(from).getTime());
    d <= dateOnly(to);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  ) {
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    if (monthEnd >= dateOnly(from) && monthEnd <= dateOnly(to))
      months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  const payroll = months.length
    ? await db.payslip.findMany({
        where: {
          payrollRun: {
            organizationId: orgId,
            branchId: inBranches,
            status: { in: ["FINALIZED", "PAID"] },
            OR: months,
          },
        },
        select: { grossEarnings: true, lopAmount: true, incentives: true, payrollRun: { select: { branchId: true } } },
      })
    : [];

  const catIds = [...new Set([...incomes.map((i) => i.categoryId), ...expenses.map((e) => e.categoryId)])];
  const [incCats, expCats] = await Promise.all([
    db.incomeCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }),
    db.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }),
  ]);
  const incName = new Map(incCats.map((c) => [c.id, c.name]));
  const expName = new Map(expCats.map((c) => [c.id, c.name]));

  const netOfGst = (s: {
    grandTotal: Prisma.Decimal | null;
    cgstTotal: Prisma.Decimal | null;
    sgstTotal: Prisma.Decimal | null;
    igstTotal: Prisma.Decimal | null;
  }) => p(s.grandTotal) - p(s.cgstTotal) - p(s.sgstTotal) - p(s.igstTotal);

  const refs: BranchRef[] = branches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    registered: !!b.gstRegistrationId,
  }));
  const figures = new Map<string, BranchFigures>();
  for (const b of refs) {
    const stockValue = (type: string) => p(stock.find((s) => s.branchId === b.id && s.type === type)?.value);
    figures.set(b.id, {
      feeReceipts: p(fees.find((f) => f.branchId === b.id)?._sum.amount),
      feeRefunds: p(refunds.find((f) => f.branchId === b.id)?._sum.amount),
      serviceRevenue: netOfGst(
        invoices.find((i) => i.branchId === b.id)?._sum ?? {
          grandTotal: null,
          cgstTotal: null,
          sgstTotal: null,
          igstTotal: null,
        },
      ),
      creditNotes: netOfGst(
        credits.find((i) => i.branchId === b.id)?._sum ?? {
          grandTotal: null,
          cgstTotal: null,
          sgstTotal: null,
          igstTotal: null,
        },
      ),
      otherIncome: incomes
        .filter((i) => i.branchId === b.id)
        .map((i) => ({
          key: i.categoryId,
          label: incName.get(i.categoryId) ?? "Other income",
          amount: p(i._sum.amount),
        })),
      // Issues are negative quantities, returns positive: cost = −(issues + returns).
      partsUsed: -(stockValue("JOB_ISSUE") + stockValue("JOB_RETURN")),
      internalUse: -stockValue("INTERNAL_USE"),
      // Only write-offs count. Stock added by an adjustment isn't a gain (adjustments are also used to top up stock).
      stockAdjustments: -stockValue("ADJUSTMENT_OUT"),
      salaries: payroll
        .filter((s) => s.payrollRun.branchId === b.id)
        .reduce(
          (a, s) =>
            a +
            salaryCost({ grossEarnings: p(s.grossEarnings), lopAmount: p(s.lopAmount), incentives: p(s.incentives) }),
          0,
        ),
      expenses: expenses
        .filter((e) => e.branchId === b.id)
        .map((e) => ({
          key: e.categoryId,
          label: expName.get(e.categoryId) ?? "Expense",
          amount: expenseCost({ amount: p(e._sum.amount), gstAmount: p(e._sum.gstAmount) }, b.registered),
        }))
        .sort((x, y) => x.label.localeCompare(y.label)),
    });
  }
  return { branches: refs, figures };
}

export type PnlReport = {
  from: string;
  to: string;
  branches: (BranchRef & { pnl: Pnl })[];
  combined: Pnl;
};

/** P&L for the branches the user may see (or one branch from the switcher). */
export async function pnlReport(
  user: CurrentUser,
  opts: { from: string; to: string; activeBranchId: string | null },
): Promise<PnlReport> {
  const c = branchConstraint(user.access, "reports.financial", opts.activeBranchId);
  const ids =
    c.branchIds ??
    (
      await db.branch.findMany({
        where: { organizationId: user.organizationId, deletedAt: null },
        select: { id: true },
      })
    ).map((b) => b.id);
  const { branches, figures } = await branchFigures(user.organizationId, ids, opts.from, opts.to);
  return {
    from: opts.from,
    to: opts.to,
    branches: branches.map((b) => ({ ...b, pnl: computePnl(figures.get(b.id) ?? EMPTY_FIGURES) })),
    combined: computePnl(sumFigures([...figures.values()])),
  };
}
