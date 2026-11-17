/**
 * GST invoice maths (pure, unit tested). All money is handled in integer PAISE to avoid float errors.
 *
 * Business rules (Phase 2):
 * - Quoted prices INCLUDE GST. At a registered branch the invoice splits each line into taxable value + GST.
 * - Unregistered branch: no GST at all; the line amount is simply charged.
 * - Intra-state: CGST + SGST (half each). Inter-state (B2B customer GSTIN from another state): IGST.
 * - GST is rounded per line; the invoice total is rounded to the nearest rupee (round-off line).
 */

export type GstLineInput = {
  qty: number;
  /** Price per unit in rupees, GST-inclusive when pricesIncludeTax. */
  unitPrice: number;
  /** Line discount in rupees (on the inclusive amount). */
  discount?: number;
  /** GST rate in percent, e.g. 18. */
  taxRate: number;
};

export type GstLine = {
  gross: number; // paise: qty × price − discount
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  taxRate: number;
};

export type GstResult = {
  lines: GstLine[];
  subtotal: number; // taxable value
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
};

export type GstContext = {
  /** Seller branch has a GSTIN. */
  registered: boolean;
  interState: boolean;
  pricesIncludeTax: boolean;
};

const toPaise = (rupees: number) => Math.round(rupees * 100);

export function computeLine(input: GstLineInput, ctx: GstContext): GstLine {
  const gross = Math.max(0, Math.round(input.qty * toPaise(input.unitPrice)) - toPaise(input.discount ?? 0));
  const rate = ctx.registered ? input.taxRate : 0;
  if (rate <= 0) return { gross, taxable: gross, cgst: 0, sgst: 0, igst: 0, total: gross, taxRate: 0 };

  let taxable: number;
  let tax: number;
  if (ctx.pricesIncludeTax) {
    taxable = Math.round((gross * 100) / (100 + rate));
    tax = gross - taxable;
  } else {
    taxable = gross;
    tax = Math.round((gross * rate) / 100);
  }
  if (ctx.interState) return { gross, taxable, cgst: 0, sgst: 0, igst: tax, total: taxable + tax, taxRate: rate };
  const cgst = Math.round(tax / 2);
  return { gross, taxable, cgst, sgst: tax - cgst, igst: 0, total: taxable + tax, taxRate: rate };
}

export function computeInvoice(inputs: GstLineInput[], ctx: GstContext): GstResult {
  const lines = inputs.map((l) => computeLine(l, ctx));
  const sum = (k: keyof GstLine) => lines.reduce((a, l) => a + l[k], 0);
  const beforeRound = sum("total");
  const grandTotal = Math.round(beforeRound / 100) * 100;
  return {
    lines,
    subtotal: sum("taxable"),
    discountTotal: inputs.reduce((a, l) => a + toPaise(l.discount ?? 0), 0),
    cgstTotal: sum("cgst"),
    sgstTotal: sum("sgst"),
    igstTotal: sum("igst"),
    roundOff: grandTotal - beforeRound,
    grandTotal,
  };
}

/** Is a sale inter-state? Only when the buyer has a GSTIN from a different state than the seller's registration. */
export function isInterState(
  sellerStateCode: string | null | undefined,
  buyerGstin: string | null | undefined,
): boolean {
  if (!sellerStateCode || !buyerGstin || buyerGstin.length < 2) return false;
  return buyerGstin.slice(0, 2) !== sellerStateCode;
}

/** Paise → "1234.56" for Prisma Decimal fields. */
export function paiseToDecimalString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function rupeesToPaise(value: number | string | { toString(): string }): number {
  return Math.round(Number(value.toString()) * 100);
}
