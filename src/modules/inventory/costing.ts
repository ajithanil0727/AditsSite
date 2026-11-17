/** Weighted-average stock costing (pure, unit tested). Quantities may be fractional (metres, grams). */

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** New average cost after receiving `inQty` at `inCost` per unit. */
export function averageAfterReceipt(oldQty: number, oldAvg: number, inQty: number, inCost: number): number {
  if (inQty <= 0) throw new Error("Receipt quantity must be positive");
  // With no (or negative) stock on hand the old average means nothing.
  if (oldQty <= 0) return round(inCost, 2);
  return round((oldQty * oldAvg + inQty * inCost) / (oldQty + inQty), 2);
}

export function roundQty(n: number) {
  return round(n, 3);
}

/**
 * Landed cost per unit for a purchase line.
 * Registered branches claim the GST back (input tax credit), so cost = price before tax.
 * Unregistered branches can't, so the GST they paid is part of the cost.
 */
export function landedUnitCost(opts: { unitCost: number; taxRate: number; branchRegistered: boolean }): number {
  if (opts.branchRegistered || opts.taxRate <= 0) return round(opts.unitCost, 2);
  return round(opts.unitCost * (1 + opts.taxRate / 100), 2);
}
