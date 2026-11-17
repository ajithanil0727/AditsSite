import { describe, expect, it } from "vitest";
import { averageAfterReceipt, landedUnitCost } from "@/modules/inventory/costing";
import {
  canMove,
  chargesEditable,
  manualTargets,
  pickWarrantyDays,
  repairAllowed,
  turnaroundMinutes,
  underWarranty,
} from "./workflow";

describe("status transitions", () => {
  it("follows the repair flow", () => {
    expect(canMove("RECEIVED", "DIAGNOSIS")).toBe(true);
    expect(canMove("RECEIVED", "DELIVERED")).toBe(false);
    expect(canMove("QC", "READY")).toBe(true);
    expect(canMove("DELIVERED", "IN_REPAIR")).toBe(false);
  });
  it("hides action-only targets from the manual control", () => {
    expect(manualTargets("DIAGNOSIS")).toEqual(["IN_REPAIR", "WAITING_PARTS", "READY"]);
    expect(manualTargets("READY")).toEqual(["IN_REPAIR"]);
  });
  it("locks charges after QC or once invoiced", () => {
    expect(chargesEditable("IN_REPAIR", false)).toBe(true);
    expect(chargesEditable("READY", false)).toBe(false);
    expect(chargesEditable("IN_REPAIR", true)).toBe(false);
  });
});

describe("repairAllowed (quote rule)", () => {
  it("within the intake estimate: yes", () => {
    expect(repairAllowed({ estimatePaise: 300000, chargesPaise: 250000, latestQuote: null }).ok).toBe(true);
  });
  it("above the estimate without approval: no", () => {
    expect(repairAllowed({ estimatePaise: 300000, chargesPaise: 350000, latestQuote: null }).ok).toBe(false);
    expect(
      repairAllowed({
        estimatePaise: 300000,
        chargesPaise: 350000,
        latestQuote: { status: "SENT", totalPaise: 350000 },
      }).ok,
    ).toBe(false);
  });
  it("above the estimate with an approved quote covering it: yes", () => {
    expect(
      repairAllowed({
        estimatePaise: 300000,
        chargesPaise: 350000,
        latestQuote: { status: "APPROVED", totalPaise: 350000 },
      }).ok,
    ).toBe(true);
  });
  it("no estimate: needs an approved quote", () => {
    expect(repairAllowed({ estimatePaise: null, chargesPaise: 0, latestQuote: null }).ok).toBe(false);
  });
  it("charges grew past the approved quote: no", () => {
    const r = repairAllowed({
      estimatePaise: null,
      chargesPaise: 400000,
      latestQuote: { status: "APPROVED", totalPaise: 350000 },
    });
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("revised quote") });
  });
});

describe("turnaroundMinutes", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 10, 17, h));
  it("excludes time in paused statuses", () => {
    const minutes = turnaroundMinutes(t(0), t(10), [
      { at: t(1), pausesTat: false }, // diagnosis
      { at: t(2), pausesTat: true }, // waiting for customer: 2h -> 6h
      { at: t(6), pausesTat: false }, // in repair
      { at: t(9), pausesTat: false }, // ready
    ]);
    expect(minutes).toBe(6 * 60);
  });
  it("a pause still open at delivery is counted up to delivery", () => {
    expect(turnaroundMinutes(t(0), t(5), [{ at: t(3), pausesTat: true }])).toBe(3 * 60);
  });
});

describe("warranty", () => {
  const rules = [
    { deviceTypeId: null, problemCategoryId: null, days: 30, isDefault: true },
    { deviceTypeId: "laptop", problemCategoryId: null, days: 60, isDefault: false },
    { deviceTypeId: null, problemCategoryId: "display", days: 90, isDefault: false },
    { deviceTypeId: "laptop", problemCategoryId: "display", days: 120, isDefault: false },
  ];
  it("most specific rule wins", () => {
    expect(pickWarrantyDays(rules, "laptop", "display")).toBe(120);
    expect(pickWarrantyDays(rules, "mobile", "display")).toBe(90);
    expect(pickWarrantyDays(rules, "laptop", "charging")).toBe(60);
    expect(pickWarrantyDays(rules, "mobile", "charging")).toBe(30);
    expect(pickWarrantyDays([], "mobile", null)).toBe(0);
  });
  it("warranty end date is inclusive (IST calendar day)", () => {
    const until = new Date(Date.UTC(2026, 10, 17));
    expect(underWarranty(until, new Date("2026-11-17T17:00:00Z"))).toBe(true); // 22:30 IST on the 17th
    expect(underWarranty(until, new Date("2026-11-17T19:00:00Z"))).toBe(false); // 00:30 IST on the 18th
    expect(underWarranty(null, new Date())).toBe(false);
  });
});

describe("stock costing", () => {
  it("weighted average on receipt", () => {
    expect(averageAfterReceipt(10, 100, 10, 130)).toBe(115);
    expect(averageAfterReceipt(0, 999, 5, 80)).toBe(80);
    expect(averageAfterReceipt(3, 33.33, 1.5, 40)).toBe(35.55);
  });
  it("unregistered branch adds GST paid to the cost", () => {
    expect(landedUnitCost({ unitCost: 100, taxRate: 18, branchRegistered: true })).toBe(100);
    expect(landedUnitCost({ unitCost: 100, taxRate: 18, branchRegistered: false })).toBe(118);
  });
});
