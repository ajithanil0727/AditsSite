import "server-only";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import type { CurrentUser } from "@/modules/auth/current";
import { parseMonth } from "@/modules/courses/attendance-register";
import { canAccessBranch } from "@/modules/rbac/access";
import { holidaySet } from "./hr.service";
import { isSunday, leaveDays, monthDates, summarizeMonth, type Mark } from "./payroll-logic";

/**
 * Monthly staff attendance register for one branch: employees down the side, every day of the month across.
 * Totals use summarizeMonth (the payroll rules), so loss-of-pay and paid days match the payslips.
 * For the current month the totals run up to today (later days are blank).
 */
export type StaffCell = "P" | "L" | "½" | "A" | "Lv" | "LOP" | "S" | "H" | "?" | "" | "–";
export const STAFF_LEGEND =
  "P present · L late (paid) · ½ half day · A absent · Lv paid leave · LOP unpaid leave · S Sunday · H holiday · ? not marked (counted as present for pay) · – not employed";

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

async function employeeMonth(
  e: { id: string; joinDate: Date; exitDate: Date | null },
  year: number,
  month: number,
  holidays: Set<string>,
  until: Date,
) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const [marks, leaves] = await Promise.all([
    db.employeeAttendance.findMany({
      where: { employeeId: e.id, date: { gte: start, lte: end } },
      select: { date: true, status: true },
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId: e.id,
        status: "APPROVED",
        leaveType: { isPaid: true },
        fromDate: { lte: end },
        toDate: { gte: start },
      },
      select: { fromDate: true, toDate: true },
    }),
  ]);
  const markMap = new Map(marks.map((m) => [ymdOf(m.date), m.status as Mark]));
  const paidLeave = new Set<string>();
  for (const l of leaves) leaveDays(l.fromDate, l.toDate, holidays).dates.forEach((d) => paidLeave.add(d));
  const lastDay = e.exitDate && e.exitDate < until ? e.exitDate : until;
  const summary = summarizeMonth({
    year,
    month,
    joinDate: e.joinDate,
    exitDate: lastDay,
    marks: markMap,
    holidays,
    paidLeaveDates: paidLeave,
  });
  const cells: StaffCell[] = monthDates(year, month).map((d) => {
    const key = ymdOf(d);
    if (d < e.joinDate || (e.exitDate && d > e.exitDate)) return "–";
    if (d > until) return "";
    const m = markMap.get(key);
    if (isSunday(d)) return "S";
    if (holidays.has(key) || m === "HOLIDAY") return "H";
    if (m === "PRESENT") return "P";
    if (m === "LATE") return "L";
    if (m === "HALF_DAY") return "½";
    if (m === "ABSENT") return "A";
    if (m === "LEAVE") return paidLeave.has(key) ? "Lv" : "LOP";
    return "?";
  });
  return { cells, summary };
}

/** Branches the user may open the staff register for. */
export async function staffRegisterBranches(user: CurrentUser) {
  const rows = await db.branch.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows
    .filter((b) => canAccessBranch(user.access, "hr_attendance.view", b.id))
    .map((b) => ({ value: b.id, label: b.name }));
}

export async function getStaffRegister(user: CurrentUser, branchId: string, monthRaw: string | null | undefined) {
  if (!canAccessBranch(user.access, "hr_attendance.view", branchId)) return null;
  const branch = await db.branch.findFirst({
    where: { id: branchId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!branch) return null;
  const period = parseMonth(monthRaw);
  const [year, month] = period.month.split("-").map(Number);
  const today = istDateOnly(new Date());
  const until = today < period.to ? today : period.to;
  const holidays = await holidaySet(db, user.organizationId, branch.id, period.from, period.to);
  const employees = await db.employee.findMany({
    where: {
      organizationId: user.organizationId,
      branchId: branch.id,
      deletedAt: null,
      joinDate: { lte: period.to },
      OR: [{ exitDate: null }, { exitDate: { gte: period.from } }],
    },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      joinDate: true,
      exitDate: true,
      designation: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const rows = [];
  for (const e of employees) {
    const { cells, summary } = await employeeMonth(e, year, month, holidays, until);
    rows.push({
      id: e.id,
      name: e.name,
      code: e.employeeCode,
      designation: e.designation?.name ?? null,
      cells,
      summary,
    });
  }
  return {
    branch,
    period,
    upTo: until < period.to ? ymdOf(until) : null,
    days: monthDates(year, month).map((d) => ({
      date: ymdOf(d),
      sunday: isSunday(d),
      holiday: holidays.has(ymdOf(d)),
    })),
    rows,
  };
}
export type StaffRegister = NonNullable<Awaited<ReturnType<typeof getStaffRegister>>>;

/** One employee's month so far (employee profile). Null without access. */
export async function employeeMonthSummary(user: CurrentUser, employeeId: string) {
  const e = await db.employee.findFirst({
    where: { id: employeeId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, branchId: true, joinDate: true, exitDate: true },
  });
  if (!e || !canAccessBranch(user.access, "hr_attendance.view", e.branchId)) return null;
  const period = parseMonth(null);
  const [year, month] = period.month.split("-").map(Number);
  const today = istDateOnly(new Date());
  const holidays = await holidaySet(db, user.organizationId, e.branchId, period.from, period.to);
  const { summary } = await employeeMonth(e, year, month, holidays, today < period.to ? today : period.to);
  return { period, summary, branchId: e.branchId };
}
