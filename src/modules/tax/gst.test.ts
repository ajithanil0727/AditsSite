import { describe, expect, it } from "vitest";
import { computeInvoice, computeLine, isInterState, paiseToDecimalString } from "./gst";

const intra = { registered: true, interState: false, pricesIncludeTax: true };

describe("computeLine (GST-inclusive prices)", () => {
  it("splits ₹4,500 at 18% into taxable + CGST/SGST", () => {
    const l = computeLine({ qty: 1, unitPrice: 4500, taxRate: 18 }, intra);
    expect(l).toMatchObject({ gross: 450000, taxable: 381356, cgst: 34322, sgst: 34322, igst: 0, total: 450000 });
  });

  it("puts all tax in IGST for inter-state sales", () => {
    const l = computeLine({ qty: 1, unitPrice: 4500, taxRate: 18 }, { ...intra, interState: true });
    expect(l).toMatchObject({ taxable: 381356, cgst: 0, sgst: 0, igst: 68644, total: 450000 });
  });

  it("an odd tax paisa goes to SGST so the halves always add up", () => {
    const l = computeLine({ qty: 1, unitPrice: 100.01, taxRate: 18 }, intra);
    expect(l.cgst + l.sgst + l.taxable).toBe(l.gross);
    expect(Math.abs(l.cgst - l.sgst)).toBeLessThanOrEqual(1);
  });

  it("unregistered branch: no GST, the amount is just charged", () => {
    const l = computeLine({ qty: 2, unitPrice: 750, taxRate: 18 }, { ...intra, registered: false });
    expect(l).toMatchObject({ taxable: 150000, cgst: 0, sgst: 0, igst: 0, total: 150000, taxRate: 0 });
  });

  it("supports exclusive prices and discounts", () => {
    const l = computeLine(
      { qty: 1, unitPrice: 1000, discount: 100, taxRate: 18 },
      { ...intra, pricesIncludeTax: false },
    );
    expect(l).toMatchObject({ gross: 90000, taxable: 90000, cgst: 8100, sgst: 8100, total: 106200 });
  });

  it("free warranty lines (price 0) produce zero tax", () => {
    expect(computeLine({ qty: 1, unitPrice: 0, taxRate: 18 }, intra).total).toBe(0);
  });

  it("fractional quantities (wire in metres)", () => {
    expect(computeLine({ qty: 1.5, unitPrice: 33.33, taxRate: 0 }, intra).gross).toBe(5000);
  });
});

describe("computeInvoice", () => {
  it("totals lines and rounds to the rupee", () => {
    const r = computeInvoice(
      [
        { qty: 1, unitPrice: 4500, taxRate: 18 },
        { qty: 1, unitPrice: 349.6, taxRate: 18 },
      ],
      intra,
    );
    expect(r.subtotal + r.cgstTotal + r.sgstTotal).toBe(484960);
    expect(r.grandTotal).toBe(485000);
    expect(r.roundOff).toBe(40);
  });

  it("customer pays exactly the quoted inclusive amount when it's whole rupees", () => {
    const r = computeInvoice(
      [
        { qty: 1, unitPrice: 2999, taxRate: 18 },
        { qty: 1, unitPrice: 500, taxRate: 18 },
      ],
      intra,
    );
    expect(r.grandTotal).toBe(349900);
    expect(r.roundOff).toBe(0);
  });
});

describe("helpers", () => {
  it("isInterState only for a buyer GSTIN from another state", () => {
    expect(isInterState("32", null)).toBe(false);
    expect(isInterState("32", "32ABCDE1234F1Z5")).toBe(false);
    expect(isInterState("32", "33ABCDE1234F1Z5")).toBe(true);
    expect(isInterState(null, "33ABCDE1234F1Z5")).toBe(false);
  });
  it("paiseToDecimalString", () => {
    expect(paiseToDecimalString(381356)).toBe("3813.56");
    expect(paiseToDecimalString(5)).toBe("0.05");
    expect(paiseToDecimalString(-40)).toBe("-0.40");
  });
});
