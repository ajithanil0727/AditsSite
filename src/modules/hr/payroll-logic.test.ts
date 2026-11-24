import { describe, expect, it } from "vitest";
import {
  computePayslip,
  daysInMonth,
  leaveDays,
  leaveYear,
  salaryCost,
  summarizeMonth,
  type Mark,
} from "./payroll-logic";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("summarizeMonth (November 2026: 30 days, Sundays 1, 8, 15, 22, 29)", () => {
  const base = {
    year: 2026,
    month: 11,
    joinDate: d("2026-01-01"),
    exitDate: null,
    holidays: new Set<string>(),
    paidLeaveDates: new Set<string>(),
  };

  it("unmarked working days count as present but are flagged", () => {
    const s = summarizeMonth({ ...base, marks: new Map() });
    expect(s.daysInMonth).toBe(30);
    expect(s.weeklyOffs).toBe(5);
    expect(s.unmarked).toBe(25);
    expect(s.paidDays).toBe(30);
  });

  it("absent, half day and unpaid leave are loss of pay; paid leave and holidays aren't", () => {
    const marks = new Map<string, Mark>([
      ["2026-11-02", "ABSENT"],
      ["2026-11-03", "HALF_DAY"],
      ["2026-11-04", "LEAVE"], // approved paid leave
      ["2026-11-05", "LEAVE"], // not covered
      ["2026-11-06", "LATE"],
    ]);
    const s = summarizeMonth({
      ...base,
      marks,
      holidays: new Set(["2026-11-14"]),
      paidLeaveDates: new Set(["2026-11-04"]),
    });
    expect(s.lopDays).toBe(2.5);
    expect(s.paidDays).toBe(27.5);
    expect(s.paidLeave).toBe(1);
    expect(s.holidays).toBe(1);
    expect(s.present).toBe(1);
  });

  it("isn't paid before joining or after exit", () => {
    const s = summarizeMonth({ ...base, joinDate: d("2026-11-16"), exitDate: d("2026-11-25"), marks: new Map() });
    expect(s.employedDays).toBe(10);
    expect(s.paidDays).toBe(10);
  });
});

describe("computePayslip", () => {
  const earnings = [
    { componentId: "b", label: "Basic", amount: 12_000_00 },
    { componentId: "h", label: "HRA", amount: 3_000_00 },
  ];

  it("full month: gross less deductions", () => {
    const p = computePayslip({
      earnings,
      deductions: [{ componentId: "u", label: "Uniform", amount: 200_00 }],
      daysInMonth: 30,
      paidDays: 30,
      incentives: 0,
      advance: null,
    });
    expect(p.earned).toBe(15_000_00);
    expect(p.netPay).toBe(14_800_00);
    expect(p.lopAmount).toBe(0);
  });

  it("loss of pay = salary ÷ days in month per day", () => {
    const p = computePayslip({ earnings, deductions: [], daysInMonth: 30, paidDays: 28, incentives: 0, advance: null });
    expect(p.lopAmount).toBe(1_000_00); // ₹15,000 ÷ 30 × 2
    expect(p.netPay).toBe(14_000_00);
  });

  it("adds incentives and recovers an advance without going negative", () => {
    const p = computePayslip({
      earnings,
      deductions: [],
      daysInMonth: 30,
      paidDays: 30,
      incentives: 500_00,
      advance: { outstanding: 4_000_00, monthlyRecovery: 2_000_00 },
    });
    expect(p.advanceRecovery).toBe(2_000_00);
    expect(p.netPay).toBe(13_500_00);
    const tiny = computePayslip({
      earnings,
      deductions: [],
      daysInMonth: 30,
      paidDays: 1,
      incentives: 0,
      advance: { outstanding: 4_000_00, monthlyRecovery: 2_000_00 },
    });
    expect(tiny.advanceRecovery).toBe(tiny.earned);
    expect(tiny.netPay).toBe(0);
  });

  it("salary cost for the P&L is earned pay plus incentives", () => {
    expect(salaryCost({ grossEarnings: 15_000_00, lopAmount: 1_000_00, incentives: 500_00 })).toBe(14_500_00);
  });
});

describe("leave", () => {
  it("counts days without Sundays and holidays", () => {
    // Sat 14 to Tue 17 Nov 2026 with Sunday 15 and a holiday on the 16th
    expect(leaveDays(d("2026-11-14"), d("2026-11-17"), new Set(["2026-11-16"]))).toEqual({
      days: 2,
      dates: ["2026-11-14", "2026-11-17"],
    });
  });
  it("leave year is the financial year", () => {
    expect(leaveYear(d("2026-11-20"))).toBe(2026);
    expect(leaveYear(d("2027-02-10"))).toBe(2026);
    expect(leaveYear(d("2027-04-01"))).toBe(2027);
  });
  it("days in month", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});
