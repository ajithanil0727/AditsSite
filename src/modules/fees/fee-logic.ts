/**
 * Fee rules (pure, unit tested). Money in integer PAISE.
 *
 * Phase 3 decisions:
 * - One fixed fee per course. Instalment schedule comes from a fee plan and can be edited at admission;
 *   the schedule must add up to the net fee.
 * - Payments settle the oldest unpaid instalment first.
 * - Discounts reduce the LAST unpaid instalments first. A discount above the user's role limit needs approval.
 * - Dropping out waives every unpaid instalment.
 */

export type ScheduleLine = { label: string; amount: number; dueDate: Date };
export type PlanItem = { label: string; percentOfFee: number; dueAfterDays: number };

const DAY = 86_400_000;

/** Split the net fee by a plan's percentages; the last line absorbs rounding. */
export function scheduleFromPlan(netFeePaise: number, items: PlanItem[], start: Date): ScheduleLine[] {
  if (items.length === 0) return [{ label: "Full fee", amount: netFeePaise, dueDate: start }];
  const lines = items.map((i) => ({
    label: i.label,
    amount: Math.round((netFeePaise * i.percentOfFee) / 100),
    dueDate: new Date(start.getTime() + i.dueAfterDays * DAY),
  }));
  const diff = netFeePaise - lines.reduce((a, l) => a + l.amount, 0);
  lines[lines.length - 1].amount += diff;
  return lines;
}

export function validateSchedule(lines: { amount: number; dueDate: Date }[], netFeePaise: number): string | null {
  if (lines.length === 0) return "Add at least one instalment.";
  if (lines.some((l) => l.amount <= 0)) return "Every instalment must be more than zero.";
  const sum = lines.reduce((a, l) => a + l.amount, 0);
  if (sum !== netFeePaise) {
    return `Instalments add up to ₹${(sum / 100).toFixed(2)} but the fee is ₹${(netFeePaise / 100).toFixed(2)}.`;
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].dueDate.getTime() < lines[i - 1].dueDate.getTime()) return "Due dates must be in order.";
  }
  return null;
}

export type Instalment = {
  id: string;
  sequence: number;
  amount: number;
  paid: number;
  status: "DUE" | "PARTIAL" | "PAID" | "WAIVED";
};

export function instalmentDue(i: Instalment): number {
  return i.status === "WAIVED" || i.status === "PAID" ? 0 : Math.max(0, i.amount - i.paid);
}

export function totalDue(list: Instalment[]): number {
  return list.reduce((a, i) => a + instalmentDue(i), 0);
}

/** Oldest unpaid first. Throws if the payment is more than what is due. */
export function allocatePayment(list: Instalment[], paymentPaise: number): { instalmentId: string; amount: number }[] {
  if (paymentPaise <= 0) throw new Error("Payment must be more than zero.");
  const due = totalDue(list);
  if (paymentPaise > due) throw new Error(`Only ₹${(due / 100).toFixed(2)} is due.`);
  let left = paymentPaise;
  const out: { instalmentId: string; amount: number }[] = [];
  for (const i of [...list].sort((a, b) => a.sequence - b.sequence)) {
    if (left === 0) break;
    const d = instalmentDue(i);
    if (d === 0) continue;
    const take = Math.min(d, left);
    out.push({ instalmentId: i.id, amount: take });
    left -= take;
  }
  return out;
}

export function statusAfter(amount: number, paid: number): "DUE" | "PARTIAL" | "PAID" {
  if (paid >= amount) return "PAID";
  return paid > 0 ? "PARTIAL" : "DUE";
}

/** Reduce unpaid instalments from the last one backwards. Returns the new amount per instalment id. */
export function applyDiscount(list: Instalment[], discountPaise: number): Map<string, number> {
  if (discountPaise <= 0) return new Map();
  if (discountPaise > totalDue(list)) throw new Error("The discount is more than the fee still due.");
  let left = discountPaise;
  const out = new Map<string, number>();
  for (const i of [...list].sort((a, b) => b.sequence - a.sequence)) {
    if (left === 0) break;
    const reducible = instalmentDue(i);
    if (reducible === 0) continue;
    const cut = Math.min(reducible, left);
    out.set(i.id, i.amount - cut);
    left -= cut;
  }
  return out;
}

/**
 * Does a discount need approval? Within BOTH the role's percent and amount limits: no.
 * A limit of 0 means every discount needs approval.
 */
export function discountNeedsApproval(opts: {
  courseFeePaise: number;
  discountPaise: number;
  limitPercent: number;
  limitAmountRupees: number;
}): boolean {
  if (opts.discountPaise <= 0) return false;
  const percent = (opts.discountPaise * 100) / opts.courseFeePaise;
  return percent > opts.limitPercent + 1e-9 || opts.discountPaise > Math.round(opts.limitAmountRupees * 100);
}

/** Attendance % counting present + late as attended, half-day as half; leave/holiday excluded. */
export function attendancePercent(
  marks: ("PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE" | "HOLIDAY")[],
): number | null {
  const counted = marks.filter((m) => m !== "HOLIDAY" && m !== "LEAVE");
  if (counted.length === 0) return null;
  const attended = counted.reduce((a, m) => a + (m === "PRESENT" || m === "LATE" ? 1 : m === "HALF_DAY" ? 0.5 : 0), 0);
  return Math.round((attended / counted.length) * 1000) / 10;
}
