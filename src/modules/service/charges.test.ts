import { describe, expect, it } from "vitest";
import { buildChargeLines, chargesTotalPaise, type ChargeLabour, type ChargePart } from "./charges";

const display: ChargePart = {
  id: "jp1",
  partId: "p1",
  description: "Display A52",
  qty: 1,
  returnedQty: 0,
  unitPrice: 4500,
  taxRate: 18,
  hsn: "85177990",
  isFreeWarranty: false,
};
const labour: ChargeLabour = { id: "l1", description: "Display labour", amount: 500, taxRate: 18, sac: "998717" };
const ctx = { registered: true, interState: false, pricesIncludeTax: true };

describe("buildChargeLines", () => {
  it("normal job: everything charged", () => {
    const lines = buildChargeLines({
      parts: [display],
      labour: [labour],
      isWarrantyJob: false,
      warrantyPartsFree: false,
    });
    expect(lines.map((l) => l.unitPrice)).toEqual([4500, 500]);
    expect(chargesTotalPaise(lines, ctx)).toBe(500000);
  });

  it("warranty job: labour free, parts charged by default", () => {
    const lines = buildChargeLines({
      parts: [display],
      labour: [labour],
      isWarrantyJob: true,
      warrantyPartsFree: false,
    });
    expect(lines.map((l) => [l.unitPrice, l.free])).toEqual([
      [4500, false],
      [0, true],
    ]);
  });

  it("warranty job with parts marked free: nothing to pay", () => {
    const lines = buildChargeLines({
      parts: [display],
      labour: [labour],
      isWarrantyJob: true,
      warrantyPartsFree: true,
    });
    expect(chargesTotalPaise(lines, ctx)).toBe(0);
    expect(lines[0].listPrice).toBe(4500);
  });

  it("a single part can be marked free", () => {
    const lines = buildChargeLines({
      parts: [{ ...display, isFreeWarranty: true }],
      labour: [],
      isWarrantyJob: false,
      warrantyPartsFree: false,
    });
    expect(lines[0]).toMatchObject({ unitPrice: 0, free: true });
  });

  it("returned parts are not charged", () => {
    const lines = buildChargeLines({
      parts: [
        { ...display, qty: 2, returnedQty: 1 },
        { ...display, id: "jp2", returnedQty: 1 },
      ],
      labour: [],
      isWarrantyJob: false,
      warrantyPartsFree: false,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(1);
  });
});
