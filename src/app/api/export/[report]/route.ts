import ExcelJS from "exceljs";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { writeAudit } from "@/modules/audit/audit.service";
import { db } from "@/lib/db";
import { dayBook, listExpenses } from "@/modules/accounts/accounts.queries";
import { pnlReport } from "@/modules/accounts/pnl.queries";
import type { PnlLine } from "@/modules/accounts/pnl-logic";
import { can } from "@/modules/rbac/access";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const INR = '"₹"#,##,##0.00;[Red]-"₹"#,##,##0.00';

/** Excel downloads for the accounts screens. Same permissions and branch scope as the pages. */
export async function GET(req: Request, ctx: RouteContext<"/api/export/[report]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { report } = await ctx.params;
  const url = new URL(req.url);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const from = YMD.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : today;
  const to = YMD.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : today;
  const activeBranchId = await getActiveBranchId(user);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Management";
  let name = report;

  if (report === "pnl") {
    if (!can(user.access, "reports.financial") || !can(user.access, "reports.export"))
      return new Response("Not allowed", { status: 403 });
    const r = await pnlReport(user, { from, to, activeBranchId });
    const cols = [
      ...r.branches.map((b) => ({ label: b.name, pnl: b.pnl })),
      ...(r.branches.length > 1 ? [{ label: "Combined", pnl: r.combined }] : []),
    ];
    const ws = wb.addWorksheet("Profit & loss");
    ws.addRow([`Profit & loss ${from} to ${to}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.addRow(["", ...cols.map((c) => c.label)]).font = { bold: true };
    const order: PnlLine[] = [];
    for (const l of [...r.combined.lines, ...r.branches.flatMap((b) => b.pnl.lines)])
      if (!order.some((o) => o.key === l.key)) order.push(l);
    const val = (lines: PnlLine[], key: string) => (lines.find((l) => l.key === key)?.amount ?? 0) / 100;
    for (const s of ["income", "cost"] as const) {
      ws.addRow([s === "income" ? "INCOME" : "COSTS"]).font = { bold: true };
      for (const l of order.filter((x) => x.section === s))
        ws.addRow([l.label, ...cols.map((c) => val(c.pnl.lines, l.key))]);
      ws.addRow([
        `Total ${s === "income" ? "income" : "costs"}`,
        ...cols.map((c) => (s === "income" ? c.pnl.income : c.pnl.costs) / 100),
      ]).font = { bold: true };
    }
    ws.addRow(["NET PROFIT", ...cols.map((c) => c.pnl.net / 100)]).font = { bold: true };
    ws.getColumn(1).width = 38;
    cols.forEach((_, i) => {
      ws.getColumn(i + 2).width = 18;
      ws.getColumn(i + 2).numFmt = INR;
    });
    name = `profit-and-loss_${from}_${to}`;
  } else if (report === "daybook") {
    if (!can(user.access, "accounts.view_daybook")) return new Response("Not allowed", { status: 403 });
    const account = url.searchParams.get("account");
    const b = await dayBook(user, { from, to, accountId: account || null, activeBranchId });
    const ws = wb.addWorksheet("Day book");
    ws.addRow([`Day book ${from} to ${to}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.addRow(["Date", "Account", "Entry", "Category", "Details", "In", "Out", "By"]).font = { bold: true };
    for (const r of b.rows)
      ws.addRow([
        r.date,
        r.account,
        r.source,
        r.category ?? "",
        r.narration ?? "",
        r.inflow || null,
        r.outflow || null,
        r.by,
      ]);
    ws.addRow([]);
    ws.addRow(["", "", "", "", "Opening", b.totals.opening]).font = { bold: true };
    ws.addRow(["", "", "", "", "Total", b.totals.inflow, b.totals.outflow]).font = { bold: true };
    ws.addRow(["", "", "", "", "Closing", b.totals.closing]).font = { bold: true };
    [12, 22, 24, 18, 50, 14, 14, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(6).numFmt = INR;
    ws.getColumn(7).numFmt = INR;
    name = `day-book_${from}_${to}`;
  } else if (report === "expenses") {
    if (!can(user.access, "expenses.view")) return new Response("Not allowed", { status: 403 });
    const params = parseListParams(Object.fromEntries(url.searchParams), { defaultPageSize: 100 });
    params.pageSize = 10_000;
    const r = await listExpenses(user, params, activeBranchId);
    const ws = wb.addWorksheet("Expenses");
    ws.addRow([
      "Date",
      "Branch",
      "Category",
      "Vendor",
      "Description",
      "Bill no.",
      "Amount",
      "GST",
      "Total",
      "Status",
      "Paid",
      "Entered by",
    ]).font = { bold: true };
    for (const e of r.rows)
      ws.addRow([
        e.date,
        e.branchCode,
        e.category,
        e.vendor ?? "",
        e.description,
        e.billNo ?? "",
        e.amount,
        e.gstAmount,
        e.total,
        e.status,
        e.paid ? "Yes" : "No",
        e.requestedBy,
      ]);
    [12, 8, 20, 20, 40, 14, 14, 12, 14, 12, 8, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    [7, 8, 9].forEach((c) => (ws.getColumn(c).numFmt = INR));
    name = "expenses";
  } else {
    return new Response("Not found", { status: 404 });
  }

  await writeAudit(
    db,
    { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) },
    {
      action: "EXPORT",
      entityType: "Report",
      entityId: report,
      after: { from, to },
    },
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
