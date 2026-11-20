/**
 * Profit & loss and profit distribution (pure, unit tested). Money in integer PAISE.
 *
 * Phase 5 decisions:
 * - Income: course fees on the RECEIPT date (cancelled receipts excluded), fee refunds on the day paid;
 *   service income on the INVOICE date at its value before GST (credit notes reduce it on their date).
 *   Advances aren't income until invoiced. Other income on its date.
 * - Costs: spare parts when USED (issued to a job card, at the average cost; returns reverse it), internal use
 *   and stock written off (adjustments out). Stock added by an adjustment is not a gain (adjustments are
 *   also used to top up stock). Purchases themselves are stock, not cost.
 *   Approved expenses on their date; GST on an expense is a cost only when the branch has no GSTIN
 *   (a registered branch claims it as input credit).
 * - Each expense belongs to one branch (no shared-cost split).
 * - Partner shares are optional. A branch period without shares (or not adding up to 100%) is left
 *   undistributed. Shares can change mid-period: the period is split at each change.
 */

export type Amount = { key: string; label: string; amount: number };

export type BranchFigures = {
  feeReceipts: number;
  feeRefunds: number;
  serviceRevenue: number;
  creditNotes: number;
  otherIncome: Amount[];
  partsUsed: number; // issued to jobs, net of returns
  internalUse: number;
  stockAdjustments: number; // stock written off (adjustments out)
  expenses: Amount[];
};

export type PnlLine = { key: string; label: string; section: "income" | "cost"; amount: number };
export type Pnl = { lines: PnlLine[]; income: number; costs: number; net: number };

export const EMPTY_FIGURES: BranchFigures = {
  feeReceipts: 0,
  feeRefunds: 0,
  serviceRevenue: 0,
  creditNotes: 0,
  otherIncome: [],
  partsUsed: 0,
  internalUse: 0,
  stockAdjustments: 0,
  expenses: [],
};

/** Lines in a fixed order; zero lines are kept out except the main ones. */
export function computePnl(f: BranchFigures): Pnl {
  const income: PnlLine[] = [
    { key: "fees", label: "Course fees received", section: "income", amount: f.feeReceipts },
    { key: "feeRefunds", label: "Less: fee refunds", section: "income", amount: -f.feeRefunds },
    { key: "service", label: "Service income (before GST)", section: "income", amount: f.serviceRevenue },
    { key: "creditNotes", label: "Less: credit notes", section: "income", amount: -f.creditNotes },
    ...f.otherIncome.map((o) => ({
      key: `inc:${o.key}`,
      label: o.label,
      section: "income" as const,
      amount: o.amount,
    })),
  ];
  const costs: PnlLine[] = [
    { key: "parts", label: "Spare parts used in repairs", section: "cost", amount: f.partsUsed },
    { key: "internal", label: "Parts used internally", section: "cost", amount: f.internalUse },
    { key: "stockAdj", label: "Stock written off", section: "cost", amount: f.stockAdjustments },
    ...f.expenses.map((e) => ({ key: `exp:${e.key}`, label: e.label, section: "cost" as const, amount: e.amount })),
  ];
  const keep = (l: PnlLine) => l.amount !== 0 || ["fees", "service", "parts"].includes(l.key);
  const lines = [...income, ...costs].filter(keep);
  const totalIncome = income.reduce((a, l) => a + l.amount, 0);
  const totalCosts = costs.reduce((a, l) => a + l.amount, 0);
  return { lines, income: totalIncome, costs: totalCosts, net: totalIncome - totalCosts };
}

/** Add figures of several branches (for the combined view). */
export function sumFigures(list: BranchFigures[]): BranchFigures {
  const merge = (lists: Amount[][]) => {
    const m = new Map<string, Amount>();
    for (const a of lists.flat()) {
      const cur = m.get(a.key);
      m.set(a.key, cur ? { ...cur, amount: cur.amount + a.amount } : { ...a });
    }
    return [...m.values()].sort((x, y) => x.label.localeCompare(y.label));
  };
  return {
    feeReceipts: list.reduce((a, f) => a + f.feeReceipts, 0),
    feeRefunds: list.reduce((a, f) => a + f.feeRefunds, 0),
    serviceRevenue: list.reduce((a, f) => a + f.serviceRevenue, 0),
    creditNotes: list.reduce((a, f) => a + f.creditNotes, 0),
    otherIncome: merge(list.map((f) => f.otherIncome)),
    partsUsed: list.reduce((a, f) => a + f.partsUsed, 0),
    internalUse: list.reduce((a, f) => a + f.internalUse, 0),
    stockAdjustments: list.reduce((a, f) => a + f.stockAdjustments, 0),
    expenses: merge(list.map((f) => f.expenses)),
  };
}

// ------------------------------------------------------------------ expenses

/** Cost of an expense in the P&L: GST is input credit for a registered branch, a cost otherwise. */
export function expenseCost(e: { amount: number; gstAmount: number }, branchRegistered: boolean): number {
  return branchRegistered ? e.amount : e.amount + e.gstAmount;
}

/** Above the limit → needs approval, unless the person entering it may approve expenses. */
export function expenseNeedsApproval(totalPaise: number, limitRupees: number, canApprove: boolean): boolean {
  if (canApprove) return false;
  return totalPaise > Math.round(limitRupees * 100);
}

// ------------------------------------------------------------------ profit distribution

const DAY = 86_400_000;

export type ShareRow = { partnerId: string; percent: number; from: Date; to: Date | null };
export type Segment = { from: Date; to: Date; shares: { partnerId: string; percent: number }[] };

/**
 * Split [from, to] (inclusive dates) wherever the branch's shares change.
 * Each segment carries the shares in force throughout it (possibly none).
 */
export function shareSegments(rows: ShareRow[], from: Date, to: Date): Segment[] {
  const cuts = new Set<number>([from.getTime(), to.getTime() + DAY]);
  for (const r of rows) {
    const s = r.from.getTime();
    if (s > from.getTime() && s <= to.getTime()) cuts.add(s);
    if (r.to) {
      const e = r.to.getTime() + DAY;
      if (e > from.getTime() && e <= to.getTime()) cuts.add(e);
    }
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const segFrom = new Date(points[i]);
    const segTo = new Date(points[i + 1] - DAY);
    const shares = rows
      .filter((r) => r.from.getTime() <= segFrom.getTime() && (!r.to || r.to.getTime() >= segTo.getTime()))
      .map((r) => ({ partnerId: r.partnerId, percent: r.percent }));
    out.push({ from: segFrom, to: segTo, shares });
  }
  return out;
}

export type DistributionLine = { partnerId: string; percent: number; amount: number };

/**
 * Split a net profit (or loss) by shares. Shares must add up to 100%, otherwise nothing is distributed.
 * Paise are split with the largest-remainder method so the lines add up exactly.
 */
export function splitProfit(
  netPaise: number,
  shares: { partnerId: string; percent: number }[],
): { lines: DistributionLine[]; undistributed: number } {
  const total = shares.reduce((a, s) => a + s.percent, 0);
  if (shares.length === 0 || Math.abs(total - 100) > 0.001) return { lines: [], undistributed: netPaise };
  const sign = netPaise < 0 ? -1 : 1;
  const abs = Math.abs(netPaise);
  const raw = shares.map((s) => (abs * s.percent) / 100);
  const floors = raw.map(Math.floor);
  let left = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left === 0) break;
    floors[o.i]++;
    left--;
  }
  return {
    lines: shares.map((s, i) => ({ partnerId: s.partnerId, percent: s.percent, amount: sign * floors[i] })),
    undistributed: 0,
  };
}

/** Do shares for one branch from one date add up to 100%? (They're optional, but if entered they must.) */
export function validateShareSet(shares: { percent: number }[]): string | null {
  if (shares.length === 0) return null;
  if (shares.some((s) => s.percent <= 0 || s.percent > 100)) return "Each share must be between 0 and 100%.";
  const total = Math.round(shares.reduce((a, s) => a + s.percent, 0) * 100) / 100;
  return total === 100 ? null : `Shares add up to ${total}%, not 100%.`;
}
