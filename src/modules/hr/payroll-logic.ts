/**
 * Attendance, leave and payroll rules (pure, unit tested). Money in integer PAISE.
 *
 * Phase 6 decisions:
 * - Sunday is the weekly off for everyone. Sundays and holidays are paid.
 * - A day's pay = monthly salary ÷ days in that month. Loss of pay (LOP) = absent days, half days (½),
 *   and leave days not covered by approved PAID leave.
 * - A working day nobody marked counts as present but is flagged on the payroll so HR can fix it first.
 * - Days before joining / after exit aren't paid.
 * - Leave year = financial year (April–March). Leave days exclude Sundays and holidays.
 * - Earnings are prorated by paid days; fixed deductions aren't. Approved incentives (manual) are added.
 *   Advance recovery is taken last and never makes pay negative.
 * - Salary cost counts in the month the payroll is for, once finalised (P&L).
 */

export type Mark = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE" | "HOLIDAY";

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDates(year: number, month: number): Date[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => new Date(Date.UTC(year, month - 1, i + 1)));
}

export const isSunday = (d: Date) => d.getUTCDay() === 0;

export type AttendanceSummary = {
  daysInMonth: number;
  employedDays: number;
  weeklyOffs: number;
  holidays: number;
  present: number;
  halfDays: number;
  absent: number;
  paidLeave: number;
  unpaidLeave: number;
  unmarked: number;
  lopDays: number;
  paidDays: number;
};

export function summarizeMonth(opts: {
  year: number;
  month: number;
  joinDate: Date;
  exitDate: Date | null;
  marks: Map<string, Mark>;
  holidays: Set<string>;
  paidLeaveDates: Set<string>;
}): AttendanceSummary {
  const s: AttendanceSummary = {
    daysInMonth: daysInMonth(opts.year, opts.month),
    employedDays: 0,
    weeklyOffs: 0,
    holidays: 0,
    present: 0,
    halfDays: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    unmarked: 0,
    lopDays: 0,
    paidDays: 0,
  };
  for (const d of monthDates(opts.year, opts.month)) {
    if (d < opts.joinDate || (opts.exitDate && d > opts.exitDate)) continue;
    s.employedDays++;
    const key = ymd(d);
    const mark = opts.marks.get(key);
    if (isSunday(d)) {
      s.weeklyOffs++;
      continue;
    }
    if (opts.holidays.has(key) || mark === "HOLIDAY") {
      s.holidays++;
      continue;
    }
    switch (mark) {
      case "PRESENT":
      case "LATE":
        s.present++;
        break;
      case "HALF_DAY":
        s.halfDays++;
        s.lopDays += 0.5;
        break;
      case "ABSENT":
        s.absent++;
        s.lopDays += 1;
        break;
      case "LEAVE":
        if (opts.paidLeaveDates.has(key)) s.paidLeave++;
        else {
          s.unpaidLeave++;
          s.lopDays += 1;
        }
        break;
      default:
        s.unmarked++;
    }
  }
  s.paidDays = s.employedDays - s.lopDays;
  return s;
}

export type PayLine = { componentId: string | null; label: string; amount: number };

export type Payslip = {
  earnings: PayLine[]; // prorated
  deductions: PayLine[];
  grossFull: number; // full-month earnings
  earned: number;
  lopAmount: number;
  incentives: number;
  deductionsTotal: number;
  advanceRecovery: number;
  netPay: number;
};

/** Prorate earnings by paid days (salary ÷ days in month), add incentives, take deductions and advance recovery. */
export function computePayslip(opts: {
  earnings: PayLine[]; // full-month amounts
  deductions: PayLine[];
  daysInMonth: number;
  paidDays: number;
  incentives: number;
  advance: { outstanding: number; monthlyRecovery: number } | null;
}): Payslip {
  const ratio = Math.max(0, opts.paidDays) / opts.daysInMonth;
  const earnings = opts.earnings.map((e) => ({ ...e, amount: Math.round(e.amount * ratio) }));
  const grossFull = opts.earnings.reduce((a, e) => a + e.amount, 0);
  const earned = earnings.reduce((a, e) => a + e.amount, 0);
  const deductionsTotal = opts.deductions.reduce((a, d) => a + d.amount, 0);
  const beforeAdvance = earned + opts.incentives - deductionsTotal;
  const advanceRecovery = opts.advance
    ? Math.max(0, Math.min(opts.advance.monthlyRecovery, opts.advance.outstanding, beforeAdvance))
    : 0;
  return {
    earnings,
    deductions: opts.deductions,
    grossFull,
    earned,
    lopAmount: grossFull - earned,
    incentives: opts.incentives,
    deductionsTotal,
    advanceRecovery,
    netPay: Math.max(0, beforeAdvance - advanceRecovery),
  };
}

/** Leave days between two dates (inclusive), not counting Sundays and holidays. */
export function leaveDays(from: Date, to: Date, holidays: Set<string>): { days: number; dates: string[] } {
  const dates: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const d = new Date(t);
    if (isSunday(d) || holidays.has(ymd(d))) continue;
    dates.push(ymd(d));
  }
  return { days: dates.length, dates };
}

/** Leave year = financial year start (April). */
export function leaveYear(d: Date): number {
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Salary cost of a payslip for the P&L: what the business pays, before deductions and recoveries. */
export function salaryCost(p: { grossEarnings: number; lopAmount: number; incentives: number }): number {
  return p.grossEarnings - p.lopAmount + p.incentives;
}
