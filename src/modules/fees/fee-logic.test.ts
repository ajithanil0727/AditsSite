import { describe, expect, it } from "vitest";
import {
  allocatePayment,
  applyDiscount,
  attendancePercent,
  discountNeedsApproval,
  scheduleFromPlan,
  totalDue,
  validateSchedule,
  type Instalment,
} from "./fee-logic";

const start = new Date(Date.UTC(2026, 10, 18));

describe("scheduleFromPlan", () => {
  it("splits by percentage and the last line absorbs rounding", () => {
    const s = scheduleFromPlan(
      1_000_000,
      [
        { label: "Admission", percentOfFee: 33.33, dueAfterDays: 0 },
        { label: "Inst 2", percentOfFee: 33.33, dueAfterDays: 30 },
        { label: "Inst 3", percentOfFee: 33.34, dueAfterDays: 60 },
      ],
      start,
    );
    expect(s.map((l) => l.amount)).toEqual([333_300, 333_300, 333_400]);
    expect(s[2].dueDate.toISOString().slice(0, 10)).toBe("2027-01-17");
  });
  it("no plan items: one full payment due today", () => {
    expect(scheduleFromPlan(500_000, [], start)).toEqual([{ label: "Full fee", amount: 500_000, dueDate: start }]);
  });
});

describe("validateSchedule", () => {
  const d = (n: number) => new Date(start.getTime() + n * 86_400_000);
  it("must add up to the net fee", () => {
    expect(
      validateSchedule(
        [
          { amount: 100, dueDate: d(0) },
          { amount: 100, dueDate: d(1) },
        ],
        200,
      ),
    ).toBeNull();
    expect(validateSchedule([{ amount: 100, dueDate: d(0) }], 200)).toMatch(/add up/);
  });
  it("rejects zero lines and out-of-order dates", () => {
    expect(
      validateSchedule(
        [
          { amount: 0, dueDate: d(0) },
          { amount: 200, dueDate: d(1) },
        ],
        200,
      ),
    ).toMatch(/more than zero/);
    expect(
      validateSchedule(
        [
          { amount: 100, dueDate: d(5) },
          { amount: 100, dueDate: d(1) },
        ],
        200,
      ),
    ).toMatch(/order/);
  });
});

const inst = (): Instalment[] => [
  { id: "a", sequence: 1, amount: 300_000, paid: 300_000, status: "PAID" },
  { id: "b", sequence: 2, amount: 300_000, paid: 100_000, status: "PARTIAL" },
  { id: "c", sequence: 3, amount: 400_000, paid: 0, status: "DUE" },
];

describe("allocatePayment", () => {
  it("settles the oldest unpaid instalment first", () => {
    expect(allocatePayment(inst(), 250_000)).toEqual([
      { instalmentId: "b", amount: 200_000 },
      { instalmentId: "c", amount: 50_000 },
    ]);
  });
  it("refuses over-payment", () => {
    expect(totalDue(inst())).toBe(600_000);
    expect(() => allocatePayment(inst(), 600_001)).toThrow(/Only ₹6000.00 is due/);
  });
  it("ignores waived instalments", () => {
    const list = inst();
    list[2].status = "WAIVED";
    expect(totalDue(list)).toBe(200_000);
  });
});

describe("applyDiscount", () => {
  it("reduces the last unpaid instalments first", () => {
    const m = applyDiscount(inst(), 450_000);
    expect(m.get("c")).toBe(0);
    expect(m.get("b")).toBe(250_000);
    expect(m.has("a")).toBe(false);
  });
  it("can't exceed what is still due", () => {
    expect(() => applyDiscount(inst(), 600_001)).toThrow();
  });
});

describe("discountNeedsApproval", () => {
  const fee = 2_000_000; // ₹20,000
  it("limit 0 = always needs approval", () => {
    expect(
      discountNeedsApproval({ courseFeePaise: fee, discountPaise: 100, limitPercent: 0, limitAmountRupees: 0 }),
    ).toBe(true);
  });
  it("must be within both the % and the ₹ limit", () => {
    const lim = { courseFeePaise: fee, limitPercent: 10, limitAmountRupees: 1500 };
    expect(discountNeedsApproval({ ...lim, discountPaise: 150_000 })).toBe(false); // ₹1,500 = 7.5%
    expect(discountNeedsApproval({ ...lim, discountPaise: 180_000 })).toBe(true); // ₹1,800 > ₹1,500
    expect(discountNeedsApproval({ ...lim, discountPaise: 150_000, courseFeePaise: 1_000_000 })).toBe(true); // 15%
  });
  it("no discount, no approval", () => {
    expect(
      discountNeedsApproval({ courseFeePaise: fee, discountPaise: 0, limitPercent: 0, limitAmountRupees: 0 }),
    ).toBe(false);
  });
});

describe("attendancePercent", () => {
  it("counts late as present, half-day as half, skips leave/holiday", () => {
    expect(attendancePercent(["PRESENT", "LATE", "ABSENT", "HALF_DAY", "LEAVE", "HOLIDAY"])).toBe(62.5);
    expect(attendancePercent(["HOLIDAY"])).toBeNull();
  });
});
