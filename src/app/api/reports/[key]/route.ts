import ExcelJS from "exceljs";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { writeAudit } from "@/modules/audit/audit.service";
import { db } from "@/lib/db";
import { can } from "@/modules/rbac/access";
import { findReport, parseFilters, runReport } from "@/modules/reports/reports";

const INR = '"₹"#,##,##0.00;[Red]-"₹"#,##,##0.00';

/** Excel download of any report in the registry. Same rows as the page; audited (EXPORT). */
export async function GET(req: Request, ctx: RouteContext<"/api/reports/[key]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { key } = await ctx.params;
  const report = findReport(key);
  if (!report) return new Response("Not found", { status: 404 });
  if (!can(user.access, report.permission) || !can(user.access, "reports.export")) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const f = parseFilters(Object.fromEntries(url.searchParams));
  const result = await runReport(user, report, f);
  if (!result) return new Response("Not allowed", { status: 403 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Management";
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([report.usesDates ? `${report.title} ${f.from} to ${f.to}` : `${report.title} (as of today)`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(report.columns.map((c) => c.label)).font = { bold: true };
  for (const r of result.rows)
    ws.addRow(report.columns.map((c) => (c.type === "date" && r[c.key] ? new Date(`${r[c.key]}T00:00:00Z`) : r[c.key])));
  if (report.columns.some((c) => c.total) && result.rows.length) {
    ws.addRow(report.columns.map((c, i) => (c.total ? result.totals[c.key] : i === 0 ? "Total" : null))).font = { bold: true };
  }
  report.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.type === "text" ? 24 : 14;
    if (c.type === "money") col.numFmt = INR;
    if (c.type === "date") col.numFmt = "dd/mm/yyyy";
  });

  const meta = await getRequestMeta();
  await writeAudit(db, { organizationId: user.organizationId, userId: user.id, ...meta }, {
    action: "EXPORT",
    entityType: "Report",
    entityId: report.key,
    after: { ...f, rows: result.rows.length },
  });
  const buf = await wb.xlsx.writeBuffer();
  const name = `${report.key}_${report.usesDates ? `${f.from}_${f.to}` : "today"}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
