import "server-only";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import type { CurrentUser } from "@/modules/auth/current";
import { attendancePercent } from "@/modules/fees/fee-logic";
import { branchConstraint, canAccessBranch, scopeOf } from "@/modules/rbac/access";

/**
 * Monthly student attendance register for one batch: students down the side, class days across the top.
 * Same rule as the batch page: student_attendance.view on the batch's branch; trainers (OWN) only their own batches.
 * The page, the print view and the Excel download all use this.
 */
export type RegisterMark = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE" | "HOLIDAY";
export const MARK_CODE: Record<RegisterMark, string> = {
  PRESENT: "P",
  ABSENT: "A",
  LATE: "L",
  HALF_DAY: "½",
  LEAVE: "Lv",
  HOLIDAY: "H",
};
export const MARK_LEGEND =
  "P present · L late (counts as present) · ½ half day · A absent · Lv leave · H holiday · blank = not marked";

/** "2026-11" → first and last day (UTC dates). Falls back to the current month (IST). */
export function parseMonth(raw: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  const today = istDateOnly(new Date());
  const y = m ? Number(m[1]) : today.getUTCFullYear();
  const mo = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : today.getUTCMonth() + 1;
  return {
    month: `${y}-${String(mo).padStart(2, "0")}`,
    from: new Date(Date.UTC(y, mo - 1, 1)),
    to: new Date(Date.UTC(y, mo, 0)),
    label: new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function canSeeBatch(user: CurrentUser, b: { branchId: string; trainerId: string | null }) {
  return (
    canAccessBranch(user.access, "student_attendance.view", b.branchId) &&
    (scopeOf(user.access, "student_attendance.view") !== "OWN" || b.trainerId === user.id)
  );
}

/** Batches the user may open the register for (newest first). */
export async function registerBatchOptions(user: CurrentUser, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "student_attendance.view", activeBranchId);
  const rows = await db.batch.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(c.branchIds === null ? {} : { branchId: { in: c.branchIds } }),
      ...(c.ownOnly ? { trainerId: user.id } : {}),
    },
    select: { id: true, name: true, code: true, status: true, branch: { select: { code: true } } },
    orderBy: [{ startDate: "desc" }],
  });
  return rows.map((b) => ({ value: b.id, label: `${b.name} (${b.branch.code})`, status: b.status }));
}

export async function getAttendanceRegister(user: CurrentUser, batchId: string, monthRaw: string | null | undefined) {
  const batch = await db.batch.findFirst({
    where: { id: batchId, organizationId: user.organizationId, deletedAt: null },
    include: {
      course: { select: { name: true } },
      branch: { select: { name: true, code: true } },
      trainer: { select: { name: true } },
    },
  });
  if (!batch || !canSeeBatch(user, batch)) return null;
  const period = parseMonth(monthRaw);
  const sessions = await db.batchSession.findMany({
    where: { batchId: batch.id, date: { gte: period.from, lte: period.to } },
    include: { records: { select: { enrollmentId: true, status: true } } },
    orderBy: { date: "asc" },
  });
  // Students in the batch now (not dropped), plus anyone marked in these sessions (moved batch / dropped later).
  const marked = new Set(sessions.flatMap((s) => s.records.map((r) => r.enrollmentId)));
  const enrollments = await db.enrollment.findMany({
    where: {
      deletedAt: null,
      OR: [{ batchId: batch.id, status: { not: "DROPPED" } }, { id: { in: [...marked] } }],
    },
    include: { student: { select: { name: true, studentCode: true } } },
    orderBy: { student: { name: "asc" } },
  });
  const days = sessions.map((s) => ({ date: s.date.toISOString().slice(0, 10), topic: s.topic }));
  const rows = enrollments.map((e) => {
    const marks = sessions.map(
      (s) => (s.records.find((r) => r.enrollmentId === e.id)?.status ?? null) as RegisterMark | null,
    );
    const has = marks.filter((m): m is RegisterMark => m !== null);
    const count = (k: RegisterMark) => has.filter((m) => m === k).length;
    return {
      enrollmentId: e.id,
      name: e.student.name,
      code: e.student.studentCode,
      status: e.status,
      marks,
      present: count("PRESENT") + count("LATE"),
      half: count("HALF_DAY"),
      absent: count("ABSENT"),
      leave: count("LEAVE"),
      percent: attendancePercent(has),
    };
  });
  const presentPerDay = sessions.map(
    (s) =>
      s.records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length +
      s.records.filter((r) => r.status === "HALF_DAY").length / 2,
  );
  return {
    batch: {
      id: batch.id,
      name: batch.name,
      code: batch.code,
      timing: batch.timing,
      course: batch.course.name,
      branch: batch.branch.name,
      branchCode: batch.branch.code,
      trainer: batch.trainer?.name ?? null,
    },
    period,
    days,
    rows,
    presentPerDay,
  };
}
export type AttendanceRegister = NonNullable<Awaited<ReturnType<typeof getAttendanceRegister>>>;
