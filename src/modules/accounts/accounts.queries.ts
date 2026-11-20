import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, canAccessBranch, type BranchConstraint } from "@/modules/rbac/access";
import type { PermissionKey } from "@/lib/permissions";
import { dateOnly } from "./pnl.queries";
import type { RunSummaryBranch } from "./partners.service";

const n = (v: Prisma.Decimal | number | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;
const branchIn = (c: BranchConstraint) => (c.branchIds ? { branchId: { in: c.branchIds } } : {});

/** Dropdown options for the money forms, limited to branches the user may use for `permission`. */
export async function moneyFormOptions(user: CurrentUser, permission: PermissionKey) {
  const orgId = user.organizationId;
  const [branches, modes, accounts, expenseCats, incomeCats, vendors] = await Promise.all([
    db.branch.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      select: { id: true, name: true, gstRegistrationId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.paymentMode.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.moneyAccount.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.expenseCategory.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.incomeCategory.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { name: "asc" } }),
    db.vendor.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);
  const allowed = branches.filter((b) => canAccessBranch(user.access, permission, b.id));
  return {
    branches: allowed.map((b) => ({ value: b.id, label: b.name, registered: !!b.gstRegistrationId })),
    modes: modes.map((m) => ({ value: m.id, label: m.name, requiresReference: m.requiresReference })),
    accounts: accounts
      .filter((a) => allowed.some((b) => b.id === a.branchId))
      .map((a) => ({ value: a.id, label: a.name, branchId: a.branchId })),
    expenseCategories: expenseCats.map((c) => ({ value: c.id, label: c.name })),
    incomeCategories: incomeCats.map((c) => ({ value: c.id, label: c.name })),
    vendors: vendors.map((v) => ({ value: v.id, label: v.name })),
  };
}

// ------------------------------------------------------------------ expenses

export async function listExpenses(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "expenses.view", activeBranchId);
  const f = p.filters;
  const where: Prisma.ExpenseWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...branchIn(c),
    ...(c.ownOnly ? { requestedById: user.id } : {}),
    ...(f.status === "UNPAID"
      ? { status: "APPROVED", paidAt: null }
      : f.status
        ? { status: f.status as never }
        : { status: { not: "CANCELLED" } }),
    ...(f.category ? { categoryId: f.category } : {}),
    ...(f.from || f.to
      ? { date: { ...(f.from ? { gte: dateOnly(f.from) } : {}), ...(f.to ? { lte: dateOnly(f.to) } : {}) } }
      : {}),
    ...(p.q
      ? {
          OR: [
            { description: { contains: p.q, mode: "insensitive" } },
            { billNo: { contains: p.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total, sum] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      ...paging(p),
      include: {
        category: { select: { name: true } },
        vendor: { select: { name: true } },
        branch: { select: { code: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        moneyAccount: { select: { name: true } },
      },
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { total: true } }),
  ]);
  const bills = await db.attachment.findMany({
    where: { entityType: "Expense", entityId: { in: rows.map((r) => r.id) } },
    select: { entityId: true, fileId: true },
  });
  return {
    total,
    sumTotal: n(sum._sum.total),
    rows: rows.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      branchCode: e.branch.code,
      branchId: e.branchId,
      category: e.category.name,
      vendor: e.vendor?.name ?? null,
      description: e.description,
      billNo: e.billNo,
      billFileId: bills.find((b) => b.entityId === e.id)?.fileId ?? null,
      amount: n(e.amount),
      gstAmount: n(e.gstAmount),
      total: n(e.total),
      status: e.status,
      paid: !!e.paidAt,
      paidFrom: e.moneyAccount?.name ?? null,
      requestedBy: e.requestedBy.name,
      requestedById: e.requestedById,
      approvedBy: e.approvedBy?.name ?? null,
    })),
  };
}
export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>["rows"][number];

// ------------------------------------------------------------------ other income

export async function listIncome(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "income.view", activeBranchId);
  const f = p.filters;
  const where: Prisma.IncomeWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...branchIn(c),
    ...(f.category ? { categoryId: f.category } : {}),
    ...(p.q ? { description: { contains: p.q, mode: "insensitive" } } : {}),
  };
  const [rows, total, sum] = await Promise.all([
    db.income.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      ...paging(p),
      include: {
        category: { select: { name: true } },
        branch: { select: { code: true } },
        moneyAccount: { select: { name: true } },
        paymentMode: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.income.count({ where }),
    db.income.aggregate({ where, _sum: { amount: true } }),
  ]);
  return {
    total,
    sumTotal: n(sum._sum.amount),
    rows: rows.map((i) => ({
      id: i.id,
      date: i.date.toISOString().slice(0, 10),
      branchCode: i.branch.code,
      category: i.category.name,
      description: i.description,
      amount: n(i.amount),
      account: i.moneyAccount.name,
      mode: i.paymentMode.name,
      by: i.createdBy.name,
    })),
  };
}
export type IncomeRow = Awaited<ReturnType<typeof listIncome>>["rows"][number];

// ------------------------------------------------------------------ day book

export const SOURCE_LABELS: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  FEE_PAYMENT: "Fee received",
  FEE_REFUND: "Fee refund",
  INVOICE_PAYMENT: "Service payment",
  SERVICE_REFUND: "Service refund",
  OTHER_INCOME: "Other income",
  EXPENSE: "Expense",
  VENDOR_PAYMENT: "Vendor payment",
  PAYROLL: "Salary",
  SALARY_ADVANCE: "Salary advance",
  PARTNER_CAPITAL: "Partner capital",
  PARTNER_DRAWING: "Partner drawing",
  CONTRA: "Transfer between accounts",
  ADJUSTMENT: "Reversal / adjustment",
};

/** Money in and out of the cash/bank accounts for a date range, with opening and closing balances. */
export async function dayBook(
  user: CurrentUser,
  opts: { from: string; to: string; accountId: string | null; activeBranchId: string | null },
) {
  const c = branchConstraint(user.access, "accounts.view_daybook", opts.activeBranchId);
  const accounts = await db.moneyAccount.findMany({
    where: { organizationId: user.organizationId, ...branchIn(c) },
    include: { branch: { select: { code: true } } },
    orderBy: [{ branch: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const chosen = opts.accountId ? accounts.filter((a) => a.id === opts.accountId) : accounts;
  const ids = chosen.map((a) => a.id);
  const from = dateOnly(opts.from);
  const to = dateOnly(opts.to);
  const [before, during, rows] = await Promise.all([
    db.moneyTransaction.groupBy({
      by: ["moneyAccountId", "direction"],
      where: { moneyAccountId: { in: ids }, date: { lt: from } },
      _sum: { amount: true },
    }),
    db.moneyTransaction.groupBy({
      by: ["moneyAccountId", "direction"],
      where: { moneyAccountId: { in: ids }, date: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    db.moneyTransaction.findMany({
      where: { moneyAccountId: { in: ids }, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 2000,
      include: {
        moneyAccount: { select: { name: true } },
        createdBy: { select: { name: true } },
        incomeCategory: { select: { name: true } },
        expenseCategory: { select: { name: true } },
      },
    }),
  ]);
  const sum = (list: typeof before, id: string, dir: "IN" | "OUT") =>
    n(list.find((x) => x.moneyAccountId === id && x.direction === dir)?._sum.amount);
  const balances = chosen.map((a) => {
    const opening = n(Number(a.openingBalance) + sum(before, a.id, "IN") - sum(before, a.id, "OUT"));
    const inflow = sum(during, a.id, "IN");
    const outflow = sum(during, a.id, "OUT");
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      branchCode: a.branch.code,
      opening,
      inflow,
      outflow,
      closing: n(opening + inflow - outflow),
    };
  });
  let running = balances.reduce((x, b) => x + b.opening, 0);
  return {
    accounts: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.branch.code})` })),
    balances,
    totals: {
      opening: n(balances.reduce((x, b) => x + b.opening, 0)),
      inflow: n(balances.reduce((x, b) => x + b.inflow, 0)),
      outflow: n(balances.reduce((x, b) => x + b.outflow, 0)),
      closing: n(balances.reduce((x, b) => x + b.closing, 0)),
    },
    truncated: rows.length === 2000,
    rows: rows.map((r) => {
      running = n(running + (r.direction === "IN" ? 1 : -1) * Number(r.amount));
      return {
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        account: r.moneyAccount.name,
        source: SOURCE_LABELS[r.source] ?? r.source,
        category: r.incomeCategory?.name ?? r.expenseCategory?.name ?? null,
        narration: r.narration,
        inflow: r.direction === "IN" ? n(r.amount) : 0,
        outflow: r.direction === "OUT" ? n(r.amount) : 0,
        balance: running,
        by: r.createdBy.name,
      };
    }),
  };
}
export type DayBook = Awaited<ReturnType<typeof dayBook>>;

// ------------------------------------------------------------------ partners

export async function listPartners(orgId: string) {
  const [partners, shares, txns, branches] = await Promise.all([
    db.partner.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { name: "asc" },
      include: { user: { select: { email: true } } },
    }),
    db.partnerShare.findMany({ where: { effectiveTo: null, partner: { organizationId: orgId } } }),
    db.partnerTransaction.groupBy({
      by: ["partnerId", "type"],
      where: { organizationId: orgId },
      _sum: { amount: true },
    }),
    db.branch.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const t = (pid: string, type: string) => n(txns.find((x) => x.partnerId === pid && x.type === type)?._sum.amount);
  return {
    branches,
    partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      email: p.email,
      pan: p.pan,
      userId: p.userId,
      login: p.user?.email ?? null,
      isActive: p.isActive,
      shares: Object.fromEntries(
        shares.filter((s) => s.partnerId === p.id).map((s) => [s.branchId, Number(s.percent)]),
      ),
      capital: n(t(p.id, "CAPITAL_IN") - t(p.id, "CAPITAL_OUT")),
      drawings: t(p.id, "DRAWING"),
    })),
    /** Current share set per branch: total %, so the screen can flag branches that aren't set. */
    branchTotals: Object.fromEntries(
      branches.map((b) => [
        b.id,
        Math.round(shares.filter((s) => s.branchId === b.id).reduce((a, s) => a + Number(s.percent), 0) * 100) / 100,
      ]),
    ),
  };
}

export async function getPartner(orgId: string, id: string) {
  const p = await db.partner.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: {
      user: { select: { email: true, name: true } },
      shares: { include: { branch: { select: { name: true, code: true } } }, orderBy: [{ effectiveFrom: "desc" }] },
      transactions: {
        include: {
          branch: { select: { code: true } },
          moneyAccount: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 200,
      },
      distributionLines: {
        where: { run: { status: "LOCKED" } },
        include: {
          run: { select: { id: true, periodFrom: true, periodTo: true } },
          branch: { select: { code: true } },
        },
      },
    },
  });
  if (!p) return null;
  const capitalIn = p.transactions.filter((t) => t.type === "CAPITAL_IN").reduce((a, t) => a + Number(t.amount), 0);
  const capitalOut = p.transactions.filter((t) => t.type === "CAPITAL_OUT").reduce((a, t) => a + Number(t.amount), 0);
  const drawings = p.transactions.filter((t) => t.type === "DRAWING").reduce((a, t) => a + Number(t.amount), 0);
  const profitShare = p.distributionLines.reduce((a, l) => a + Number(l.amount), 0);
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    email: p.email,
    pan: p.pan,
    userId: p.userId,
    login: p.user?.email ?? null,
    isActive: p.isActive,
    shares: p.shares.map((s) => ({
      id: s.id,
      branch: s.branch.name,
      branchCode: s.branch.code,
      percent: Number(s.percent),
      from: s.effectiveFrom.toISOString().slice(0, 10),
      to: s.effectiveTo?.toISOString().slice(0, 10) ?? null,
    })),
    transactions: p.transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      type: t.type,
      amount: n(t.amount),
      branchCode: t.branch.code,
      account: t.moneyAccount?.name ?? null,
      note: t.note,
      by: t.createdBy.name,
    })),
    totals: {
      capital: n(capitalIn - capitalOut),
      drawings: n(drawings),
      profitShare: n(profitShare),
      /** Locked profit share less drawings: what the partner is still owed (negative = drew more than earned). */
      balance: n(profitShare - drawings),
    },
  };
}

// ------------------------------------------------------------------ distribution runs

export async function listRuns(orgId: string) {
  const runs = await db.profitDistributionRun.findMany({
    where: { organizationId: orgId },
    orderBy: [{ periodFrom: "desc" }, { createdAt: "desc" }],
    include: { lockedBy: { select: { name: true } } },
    take: 100,
  });
  return runs.map((r) => {
    const s = (r.summary ?? []) as RunSummaryBranch[];
    return {
      id: r.id,
      periodFrom: r.periodFrom.toISOString().slice(0, 10),
      periodTo: r.periodTo.toISOString().slice(0, 10),
      status: r.status,
      note: r.note,
      net: s.reduce((a, b) => a + b.net, 0) / 100,
      undistributed: s.reduce((a, b) => a + b.undistributed, 0) / 100,
      lockedBy: r.lockedBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getRun(orgId: string, id: string) {
  const r = await db.profitDistributionRun.findFirst({
    where: { id, organizationId: orgId },
    include: {
      lockedBy: { select: { name: true } },
      lines: {
        include: { partner: { select: { id: true, name: true } }, branch: { select: { code: true, name: true } } },
        orderBy: [{ branch: { sortOrder: "asc" } }, { segmentFrom: "asc" }],
      },
    },
  });
  if (!r) return null;
  const from = r.periodFrom;
  const to = r.periodTo;
  const drawings = await db.partnerTransaction.groupBy({
    by: ["partnerId"],
    where: { organizationId: orgId, type: "DRAWING", date: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  const byPartner = new Map<string, { id: string; name: string; share: number }>();
  for (const l of r.lines) {
    const cur = byPartner.get(l.partnerId) ?? { id: l.partner.id, name: l.partner.name, share: 0 };
    cur.share += Number(l.amount);
    byPartner.set(l.partnerId, cur);
  }
  return {
    id: r.id,
    periodFrom: from.toISOString().slice(0, 10),
    periodTo: to.toISOString().slice(0, 10),
    status: r.status,
    note: r.note,
    lockedBy: r.lockedBy?.name ?? null,
    lockedAt: r.lockedAt?.toISOString() ?? null,
    summary: ((r.summary ?? []) as RunSummaryBranch[]).map((s) => ({
      ...s,
      income: s.income / 100,
      costs: s.costs / 100,
      net: s.net / 100,
      distributed: s.distributed / 100,
      undistributed: s.undistributed / 100,
    })),
    lines: r.lines.map((l) => ({
      id: l.id,
      branch: l.branch.name,
      branchCode: l.branch.code,
      partner: l.partner.name,
      percent: Number(l.sharePercent),
      net: n(l.branchNetProfit),
      amount: n(l.amount),
      segmentFrom: l.segmentFrom?.toISOString().slice(0, 10) ?? null,
      segmentTo: l.segmentTo?.toISOString().slice(0, 10) ?? null,
    })),
    partners: [...byPartner.values()].map((p) => {
      const drawn = n(drawings.find((d) => d.partnerId === p.id)?._sum.amount);
      return { ...p, share: n(p.share), drawings: drawn, balance: n(p.share - drawn) };
    }),
  };
}
