/**
 * Job card workflow rules (pure, unit tested).
 * Status NAMES are admin-configurable; each status maps to a fixed system key that drives these rules.
 */
import type { JobStatusKey } from "@/generated/prisma/enums";
import { istDateOnly } from "@/lib/fy";

/** Allowed moves between system keys. */
export const TRANSITIONS: Record<JobStatusKey, JobStatusKey[]> = {
  RECEIVED: ["DIAGNOSIS", "CANCELLED"],
  DIAGNOSIS: ["QUOTE_SENT", "IN_REPAIR", "WAITING_PARTS", "READY", "CANCELLED"],
  QUOTE_SENT: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IN_REPAIR", "WAITING_PARTS", "CANCELLED"],
  REJECTED: ["READY", "QUOTE_SENT"], // return unrepaired, or re-quote
  IN_REPAIR: ["WAITING_PARTS", "QC", "QUOTE_SENT"],
  WAITING_PARTS: ["IN_REPAIR", "QUOTE_SENT", "CANCELLED"],
  QC: ["IN_REPAIR", "READY"],
  READY: ["DELIVERED", "IN_REPAIR"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Keys reached only through their own action (send quote, record decision, deliver, cancel). */
export const ACTION_ONLY: JobStatusKey[] = ["QUOTE_SENT", "APPROVED", "REJECTED", "DELIVERED", "CANCELLED"];

export const OPEN_KEYS: JobStatusKey[] = [
  "RECEIVED",
  "DIAGNOSIS",
  "QUOTE_SENT",
  "APPROVED",
  "REJECTED",
  "IN_REPAIR",
  "WAITING_PARTS",
  "QC",
  "READY",
];

export function canMove(from: JobStatusKey, to: JobStatusKey): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Keys the manual "change status" control may offer from `from`. */
export function manualTargets(from: JobStatusKey): JobStatusKey[] {
  return TRANSITIONS[from].filter((k) => !ACTION_ONLY.includes(k));
}

/** Parts and labour can be changed until the job is QC'd / invoiced / closed. */
export function chargesEditable(key: JobStatusKey, hasIssuedInvoice: boolean): boolean {
  if (hasIssuedInvoice) return false;
  return !["READY", "DELIVERED", "CANCELLED"].includes(key);
}

/**
 * Can repair start? Within the estimate given at intake: yes. Above it (or no estimate):
 * only with an approved quotation. Amounts in paise.
 */
export function repairAllowed(opts: {
  estimatePaise: number | null;
  chargesPaise: number;
  latestQuote: { status: string; totalPaise: number } | null;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.latestQuote?.status === "APPROVED" && opts.chargesPaise <= opts.latestQuote.totalPaise) return { ok: true };
  if (opts.estimatePaise !== null && opts.chargesPaise <= opts.estimatePaise) return { ok: true };
  if (opts.latestQuote?.status === "APPROVED") {
    return { ok: false, reason: "Charges are now above the approved quotation. Send a revised quote first." };
  }
  return {
    ok: false,
    reason:
      opts.estimatePaise === null
        ? "No estimate was given at intake. Send a quotation and get the customer's approval first."
        : "Charges are above the intake estimate. Send a quotation and get the customer's approval first.",
  };
}

/**
 * Turnaround time in minutes from receipt to delivery, excluding time spent in statuses that
 * pause the clock (e.g. waiting for the customer's approval or for parts).
 * `history` = status changes in time order (the status entered and when).
 */
export function turnaroundMinutes(
  receivedAt: Date,
  deliveredAt: Date,
  history: { at: Date; pausesTat: boolean }[],
): number {
  let paused = 0;
  const sorted = [...history].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (let i = 0; i < sorted.length; i++) {
    if (!sorted[i].pausesTat) continue;
    const start = sorted[i].at.getTime();
    const end = (sorted[i + 1]?.at ?? deliveredAt).getTime();
    paused += Math.max(0, Math.min(end, deliveredAt.getTime()) - start);
  }
  const total = deliveredAt.getTime() - receivedAt.getTime() - paused;
  return Math.max(0, Math.round(total / 60_000));
}

export type WarrantyRuleLike = {
  deviceTypeId: string | null;
  problemCategoryId: string | null;
  days: number;
  isDefault: boolean;
};

/** Most specific rule wins: device type + problem > problem > device type > default. */
export function pickWarrantyDays(
  rules: WarrantyRuleLike[],
  deviceTypeId: string | null,
  problemCategoryId: string | null,
): number {
  const score = (r: WarrantyRuleLike) => {
    if (r.deviceTypeId && r.deviceTypeId !== deviceTypeId) return -1;
    if (r.problemCategoryId && r.problemCategoryId !== problemCategoryId) return -1;
    if (r.deviceTypeId && r.problemCategoryId) return 4;
    if (r.problemCategoryId) return 3;
    if (r.deviceTypeId) return 2;
    return r.isDefault ? 1 : 0;
  };
  const best = rules
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)[0];
  return best?.r.days ?? 0;
}

/** Is a job (by its warranty end date, inclusive) still under warranty on `on` (IST calendar day)? */
export function underWarranty(warrantyUntil: Date | null, on: Date): boolean {
  return !!warrantyUntil && warrantyUntil.getTime() >= istDateOnly(on).getTime();
}
