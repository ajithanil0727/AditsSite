import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { writeAudit } from "@/modules/audit/audit.service";
import { getStaffRegister, STAFF_LEGEND } from "@/modules/hr/staff-register";
import { can } from "@/modules/rbac/access";

/** Excel download of the staff attendance register (same rows as the page). Audited (EXPORT). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!can(user.access, "hr_attendance.view")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const r = await getStaffRegister(user, url.searchParams.get("branch") ?? "", url.searchParams.get("month"));
  if (!r) return new Response("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Management";
  const ws = wb.addWorksheet(r.period.month);
  ws.addRow([`Staff attendance register · ${r.branch.name} · ${r.period.label}`]).font = { bold: true, size: 13 };
  ws.addRow([r.upTo ? `Totals up to ${r.upTo.split("-").reverse().join("/")}` : "Full month"]);
  ws.addRow([]);
  const totals = [
    "Present",
    "Half days",
    "Absent",
    "Paid leave",
    "Unpaid leave",
    "Not marked",
    "LOP days",
    "Paid days",
  ];
  ws.addRow(["Employee", "Employee ID", "Designation", ...r.days.map((d) => Number(d.date.slice(8))), ...totals]).font =
    { bold: true };
  for (const e of r.rows) {
    const s = e.summary;
    ws.addRow([
      e.name,
      e.code,
      e.designation ?? "",
      ...e.cells,
      s.present,
      s.halfDays,
      s.absent,
      s.paidLeave,
      s.unpaidLeave,
      s.unmarked,
      s.lopDays,
      s.paidDays,
    ]);
  }
  ws.addRow([]);
  ws.addRow([STAFF_LEGEND]).font = { italic: true, color: { argb: "FF666666" } };
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 18;
  r.days.forEach((d, i) => {
    const col = ws.getColumn(4 + i);
    col.width = 4.5;
    col.alignment = { horizontal: "center" };
    if (d.sunday || d.holiday) {
      for (let row = 4; row <= 4 + r.rows.length; row++)
        ws.getRow(row).getCell(4 + i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F4" } };
    }
  });
  totals.forEach((_, i) => (ws.getColumn(4 + r.days.length + i).width = 11));
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const meta = await getRequestMeta();
  await writeAudit(
    db,
    { organizationId: user.organizationId, userId: user.id, ...meta },
    {
      action: "EXPORT",
      entityType: "StaffAttendanceRegister",
      entityId: r.branch.id,
      after: { month: r.period.month, staff: r.rows.length },
    },
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="staff-attendance_${r.branch.code}_${r.period.month}.xlsx"`,
    },
  });
}
