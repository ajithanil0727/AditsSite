import { describe, expect, it } from "vitest";
import {
  computePnl,
  EMPTY_FIGURES,
  expenseCost,
  expenseNeedsApproval,
  shareSegments,
  splitProfit,
  sumFigures,
  validateShareSet,
} from "./pnl-logic";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("computePnl", () => {
  it("adds income, takes off refunds, credit notes and costs", () => {
    const p = computePnl({
      ...EMPTY_FIGURES,
      feeReceipts: 100_000_00,
      feeRefunds: 5_000_00,
      serviceRevenue: 40_000_00,
      creditNotes: 2_000_00,
      otherIncome: [{ key: "w", label: "Workshop", amount: 3_000_00 }],
      partsUsed: 12_000_00,
      stockAdjustments: 500_00,
      expenses: [{ key: "r", label: "Rent", amount: 25_000_00 }],
    });
    expect(p.income).toBe(136_000_00);
    expect(p.costs).toBe(37_500_00);
    expect(p.net).toBe(98_500_00);
    expect(p.lines.find((l) => l.key === "feeRefunds")?.amount).toBe(-5_000_00);
  });

  it("hides empty optional lines but keeps the main ones", () => {
    const keys = computePnl(EMPTY_FIGURES).lines.map((l) => l.key);
    expect(keys).toEqual(["fees", "service", "parts"]);
  });

  it("shows a loss as a negative net", () => {
    expect(computePnl({ ...EMPTY_FIGURES, expenses: [{ key: "r", label: "Rent", amount: 10_00 }] }).net).toBe(-10_00);
  });

  it("combines branches line by line", () => {
    const a = { ...EMPTY_FIGURES, feeReceipts: 100, expenses: [{ key: "r", label: "Rent", amount: 30 }] };
    const b = {
      ...EMPTY_FIGURES,
      feeReceipts: 50,
      expenses: [
        { key: "r", label: "Rent", amount: 20 },
        { key: "e", label: "Electricity", amount: 5 },
      ],
    };
    const s = sumFigures([a, b]);
    expect(s.feeReceipts).toBe(150);
    expect(s.expenses).toEqual([
      { key: "e", label: "Electricity", amount: 5 },
      { key: "r", label: "Rent", amount: 50 },
    ]);
  });
});

describe("expenses", () => {
  it("GST is a cost only for a branch without GSTIN", () => {
    expect(expenseCost({ amount: 1000, gstAmount: 180 }, true)).toBe(1000);
    expect(expenseCost({ amount: 1000, gstAmount: 180 }, false)).toBe(1180);
  });
  it("needs approval above the limit unless the person can approve", () => {
    expect(expenseNeedsApproval(5_000_00, 5000, false)).toBe(false);
    expect(expenseNeedsApproval(5_000_01, 5000, false)).toBe(true);
    expect(expenseNeedsApproval(50_000_00, 5000, true)).toBe(false);
  });
});

describe("profit distribution", () => {
  it("splits by shares and keeps every paisa", () => {
    const r = splitProfit(100_01, [
      { partnerId: "a", percent: 33.34 },
      { partnerId: "b", percent: 33.33 },
      { partnerId: "c", percent: 33.33 },
    ]);
    expect(r.undistributed).toBe(0);
    expect(r.lines.reduce((x, l) => x + l.amount, 0)).toBe(100_01);
  });

  it("shares a loss too", () => {
    const r = splitProfit(-1000, [
      { partnerId: "a", percent: 50 },
      { partnerId: "b", percent: 50 },
    ]);
    expect(r.lines.map((l) => l.amount)).toEqual([-500, -500]);
  });

  it("leaves profit undistributed when shares are missing or don't add up (shares are optional)", () => {
    expect(splitProfit(1000, [])).toEqual({ lines: [], undistributed: 1000 });
    expect(splitProfit(1000, [{ partnerId: "a", percent: 60 }]).undistributed).toBe(1000);
  });

  it("splits the period where shares change", () => {
    const segs = shareSegments(
      [
        { partnerId: "a", percent: 100, from: d("2026-04-01"), to: d("2026-06-30") },
        { partnerId: "a", percent: 50, from: d("2026-07-01"), to: null },
        { partnerId: "b", percent: 50, from: d("2026-07-01"), to: null },
      ],
      d("2026-04-01"),
      d("2026-09-30"),
    );
    expect(
      segs.map((s) => [s.from.toISOString().slice(0, 10), s.to.toISOString().slice(0, 10), s.shares.length]),
    ).toEqual([
      ["2026-04-01", "2026-06-30", 1],
      ["2026-07-01", "2026-09-30", 2],
    ]);
  });

  it("a period before any shares is one segment with none", () => {
    const segs = shareSegments(
      [{ partnerId: "a", percent: 100, from: d("2027-01-01"), to: null }],
      d("2026-04-01"),
      d("2026-06-30"),
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].shares).toEqual([]);
  });

  it("validates a share set only when one is entered", () => {
    expect(validateShareSet([])).toBeNull();
    expect(validateShareSet([{ percent: 60 }, { percent: 40 }])).toBeNull();
    expect(validateShareSet([{ percent: 60 }, { percent: 30 }])).toMatch(/90%/);
  });
});
