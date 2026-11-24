import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { writeAudit } from "@/modules/audit/audit.service";
import { getAttendanceRegister, MARK_CODE, MARK_LEGEND } from "@/modules/courses/attendance-register";
import { can } from "@/modules/rbac/access";

/** Excel download of the attendance register (same rows as the page). Audited (EXPORT). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!can(user.access, "student_attendance.view")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const r = await getAttendanceRegister(user, url.searchParams.get("batch") ?? "", url.searchParams.get("month"));
  if (!r) return new Response("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Management";
  const ws = wb.addWorksheet(r.period.month);
  ws.addRow([`Attendance register · ${r.batch.name} · ${r.period.label}`]).font = { bold: true, size: 13 };
  ws.addRow([
    `${r.batch.course} · ${r.batch.branch} · ${r.batch.timing}${r.batch.trainer ? ` · Trainer: ${r.batch.trainer}` : ""}`,
  ]);
  ws.addRow([]);
  const header = ws.addRow([
    "Student",
    "Student ID",
    ...r.days.map((d) => {
      const dt = new Date(`${d.date}T00:00:00Z`);
      return `${dt.getUTCDate()} ${dt.toLocaleString("en-IN", { weekday: "short", timeZone: "UTC" }).slice(0, 2)}`;
    }),
    "Present",
    "Half days",
    "Absent",
    "Leave",
    "Attendance %",
  ]);
  header.font = { bold: true };
  for (const s of r.rows) {
    ws.addRow([
      s.name,
      s.code,
      ...s.marks.map((m) => (m ? MARK_CODE[m] : "")),
      s.present,
      s.half,
      s.absent,
      s.leave,
      s.percent === null ? null : s.percent / 100,
    ]);
  }
  ws.addRow(["Present that day", "", ...r.presentPerDay]).font = { italic: true };
  ws.addRow([]);
  ws.addRow([MARK_LEGEND]).font = { italic: true, color: { argb: "FF666666" } };

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 14;
  for (let i = 0; i < r.days.length; i++) {
    const col = ws.getColumn(3 + i);
    col.width = 5;
    col.alignment = { horizontal: "center" };
  }
  const pctCol = ws.getColumn(3 + r.days.length + 4);
  pctCol.numFmt = "0.0%";
  pctCol.width = 13;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const meta = await getRequestMeta();
  await writeAudit(
    db,
    { organizationId: user.organizationId, userId: user.id, ...meta },
    {
      action: "EXPORT",
      entityType: "AttendanceRegister",
      entityId: r.batch.id,
      after: { month: r.period.month, students: r.rows.length },
    },
  );
  const buf = await wb.xlsx.writeBuffer();
  const safe = r.batch.code.replace(/[^A-Za-z0-9-]/g, "_");
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance_${safe}_${r.period.month}.xlsx"`,
    },
  });
}
