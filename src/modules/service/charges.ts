/**
 * Turn a job's parts and labour into chargeable lines (pure, unit tested).
 * Warranty rules (Phase 2): on a warranty job, labour is free; parts are free when the service manager
 * marks the job "parts free" or marks an individual part free.
 */
import { computeInvoice, type GstContext } from "@/modules/tax/gst";

/** GST rate when a part / labour item has none set (confirmed in Phase 2: parts and labour at 18%). */
export const DEFAULT_SERVICE_GST = 18;

export type ChargePart = {
  id: string;
  partId: string;
  description: string;
  qty: number;
  returnedQty: number;
  unitPrice: number;
  taxRate: number;
  hsn: string | null;
  isFreeWarranty: boolean;
};

export type ChargeLabour = {
  id: string;
  description: string;
  amount: number;
  taxRate: number;
  sac: string | null;
};

export type ChargeLine = {
  kind: "PART" | "LABOUR";
  sourceId: string;
  partId: string | null;
  description: string;
  hsnSac: string | null;
  qty: number;
  /** Price actually charged per unit (0 when free under warranty). */
  unitPrice: number;
  listPrice: number;
  taxRate: number;
  free: boolean;
};

export function buildChargeLines(opts: {
  parts: ChargePart[];
  labour: ChargeLabour[];
  isWarrantyJob: boolean;
  warrantyPartsFree: boolean;
}): ChargeLine[] {
  const lines: ChargeLine[] = [];
  for (const p of opts.parts) {
    const qty = Math.round((p.qty - p.returnedQty) * 1000) / 1000;
    if (qty <= 0) continue;
    const free = p.isFreeWarranty || (opts.isWarrantyJob && opts.warrantyPartsFree);
    lines.push({
      kind: "PART",
      sourceId: p.id,
      partId: p.partId,
      description: p.description,
      hsnSac: p.hsn,
      qty,
      unitPrice: free ? 0 : p.unitPrice,
      listPrice: p.unitPrice,
      taxRate: p.taxRate,
      free,
    });
  }
  for (const l of opts.labour) {
    const free = opts.isWarrantyJob;
    lines.push({
      kind: "LABOUR",
      sourceId: l.id,
      partId: null,
      description: l.description,
      hsnSac: l.sac,
      qty: 1,
      unitPrice: free ? 0 : l.amount,
      listPrice: l.amount,
      taxRate: l.taxRate,
      free,
    });
  }
  return lines;
}

/** What the customer pays for these lines, in paise (prices are GST-inclusive). */
export function chargesTotalPaise(lines: ChargeLine[], ctx: GstContext): number {
  return computeInvoice(
    lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, taxRate: l.taxRate })),
    ctx,
  ).grandTotal;
}
