import ExcelJS from "exceljs";
import { getCurrentUser } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { IMPORT_ENTITIES, IMPORT_SPECS, type ImportEntity } from "@/modules/imports/import-logic";

/** Blank import template: headers only, plus a sheet explaining each column with an example. */
export async function GET(_req: Request, ctx: RouteContext<"/api/imports/template/[entity]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { entity } = await ctx.params;
  if (!(IMPORT_ENTITIES as readonly string[]).includes(entity)) return new Response("Not found", { status: 404 });
  const spec = IMPORT_SPECS[entity as ImportEntity];
  if (!can(user.access, spec.permission)) return new Response("Not allowed", { status: 403 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.label);
  ws.addRow(spec.columns.map((c) => c.header)).font = { bold: true };
  spec.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(14, c.header.length + 4);
    // Keep phone numbers / codes as text so Excel doesn't turn them into numbers or dates.
    if (c.kind === "phone" || c.kind === "text") ws.getColumn(i + 1).numFmt = "@";
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = wb.addWorksheet("How to fill");
  help.addRow(["Column", "Required", "Example", "Notes"]).font = { bold: true };
  for (const c of spec.columns) help.addRow([c.header, c.required ? "Yes" : "", c.example, c.help ?? ""]);
  help.addRow([]);
  help.addRow(["Fill the first sheet from row 2. Keep the header row as it is."]);
  help.addRow([spec.note]);
  help.getColumn(1).width = 28;
  help.getColumn(3).width = 24;
  help.getColumn(4).width = 50;
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${entity}-import-template.xlsx"`,
    },
  });
}
