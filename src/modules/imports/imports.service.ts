import "server-only";
import ExcelJS from "exceljs";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { receiveStock } from "@/modules/inventory/stock.service";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import {
  duplicatesInFile,
  IMPORT_SPECS,
  mapHeaders,
  MAX_ROWS,
  PART_KINDS,
  parseRow,
  type ImportEntity,
  type ParsedRow,
  type RawCell,
  type RowError,
} from "./import-logic";

export type CheckResult = {
  total: number;
  valid: number;
  errors: RowError[];
  sample: Record<string, string | number | null>[];
};

/** Reads the first sheet: row 1 = headers, data from row 2. Rich text / formulas / hyperlinks become plain values. */
async function readSheet(entity: ImportEntity, buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ActionError("That file couldn't be read. Upload the .xlsx template filled in Excel or Google Sheets.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ActionError("The file has no sheet.");
  const plain = (v: ExcelJS.CellValue): RawCell => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "object") {
      if ("richText" in v) return v.richText.map((r) => r.text).join("");
      if ("result" in v) return plain(v.result as ExcelJS.CellValue);
      if ("text" in v) return String(v.text);
    }
    return String(v);
  };
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => (headers[col - 1] = String(plain(cell.value) ?? "")));
  const { index, missing } = mapHeaders(entity, headers);
  if (missing.length) throw new ActionError(`Missing column(s): ${missing.join(", ")}. Use the template.`);
  const rows: { rowNo: number; raw: Record<string, RawCell> }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: Record<string, RawCell> = {};
    let any = false;
    for (const [key, i] of Object.entries(index)) {
      const v = plain(row.getCell(i + 1).value);
      raw[key] = v;
      if (v !== null && String(v).trim() !== "") any = true;
    }
    if (any) rows.push({ rowNo: r, raw });
  }
  if (rows.length === 0) throw new ActionError("The sheet has no data rows.");
  if (rows.length > MAX_ROWS) throw new ActionError(`Up to ${MAX_ROWS} rows at a time. Split the file.`);
  return rows;
}

type Refs = {
  branches: Map<string, { id: string; code: string }>;
  departments: Map<string, string>;
  designations: Map<string, string>;
  units: Map<string, string>;
  categories: Map<string, string>;
  taxRates: Map<number, string>;
  hsn: Map<string, string>;
};

async function loadRefs(orgId: string): Promise<Refs> {
  const [branches, departments, designations, units, categories, taxRates, hsn] = await Promise.all([
    db.branch.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, code: true } }),
    db.department.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true } }),
    db.designation.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true } }),
    db.unit.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, symbol: true } }),
    db.partCategory.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true } }),
    db.taxRate.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, rate: true } }),
    db.hsnSac.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, code: true } }),
  ]);
  const lc = (s: string) => s.trim().toLowerCase();
  return {
    branches: new Map(branches.map((b) => [lc(b.code), b])),
    departments: new Map(departments.map((d) => [lc(d.name), d.id])),
    designations: new Map(designations.map((d) => [lc(d.name), d.id])),
    units: new Map(units.flatMap((u) => [[lc(u.name), u.id] as const, [lc(u.symbol), u.id] as const])),
    categories: new Map(categories.map((c) => [lc(c.name), c.id])),
    taxRates: new Map(taxRates.map((t) => [Number(t.rate), t.id])),
    hsn: new Map(hsn.map((h) => [lc(h.code), h.id])),
  };
}

/** Parses + checks everything that can be checked before writing. */
async function validate(ctx: ActionContext, entity: ImportEntity, buffer: ArrayBuffer) {
  const spec = IMPORT_SPECS[entity];
  const orgId = ctx.user.organizationId;
  const raw = await readSheet(entity, buffer);
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  for (const r of raw) {
    const res = parseRow(entity, r.rowNo, r.raw);
    errors.push(...res.errors);
    rows.push(res.row);
  }
  const refs = await loadRefs(orgId);
  const lc = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase();
  const branchOk = (r: ParsedRow, key: string, permission: typeof spec.permission) => {
    const code = r.values[key];
    if (!code) return;
    const b = refs.branches.get(lc(code));
    if (!b) errors.push({ row: r.row, message: `Branch code "${code}" doesn't exist.` });
    else if (!canAccessBranch(ctx.user.access, permission, b.id))
      errors.push({ row: r.row, message: `You can't import into branch ${b.code}.` });
  };

  if (entity === "students") {
    errors.push(...duplicatesInFile(rows, "phone", "Phone"));
    const existing = await db.student.findMany({
      where: { organizationId: orgId, deletedAt: null, phone: { in: rows.map((r) => String(r.values.phone)) } },
      select: { phone: true, studentCode: true },
    });
    const byPhone = new Map(existing.map((s) => [s.phone, s.studentCode]));
    for (const r of rows) {
      branchOk(r, "branchCode", spec.permission);
      const code = byPhone.get(String(r.values.phone));
      if (code) errors.push({ row: r.row, message: `Phone ${r.values.phone} is already student ${code}.` });
    }
  } else if (entity === "employees") {
    errors.push(...duplicatesInFile(rows, "phone", "Phone"));
    const existing = await db.employee.findMany({
      where: { organizationId: orgId, deletedAt: null, phone: { in: rows.map((r) => String(r.values.phone)) } },
      select: { phone: true, employeeCode: true },
    });
    const byPhone = new Map(existing.map((e) => [e.phone, e.employeeCode]));
    for (const r of rows) {
      branchOk(r, "branchCode", spec.permission);
      if (r.values.department && !refs.departments.has(lc(r.values.department)))
        errors.push({ row: r.row, message: `Department "${r.values.department}" isn't in Master data → Departments.` });
      if (r.values.designation && !refs.designations.has(lc(r.values.designation)))
        errors.push({
          row: r.row,
          message: `Designation "${r.values.designation}" isn't in Master data → Designations.`,
        });
      const code = byPhone.get(String(r.values.phone));
      if (code) errors.push({ row: r.row, message: `Phone ${r.values.phone} is already employee ${code}.` });
    }
  } else {
    errors.push(...duplicatesInFile(rows, "sku", "SKU"));
    const existing = await db.part.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        sku: { in: rows.map((r) => String(r.values.sku)), mode: "insensitive" },
      },
      select: { sku: true },
    });
    const skus = new Set(existing.map((p) => p.sku.toLowerCase()));
    for (const r of rows) {
      if (skus.has(lc(r.values.sku))) errors.push({ row: r.row, message: `SKU ${r.values.sku} already exists.` });
      if (r.values.unit && !refs.units.has(lc(r.values.unit)))
        errors.push({ row: r.row, message: `Unit "${r.values.unit}" isn't in Master data → Units.` });
      if (r.values.category && !refs.categories.has(lc(r.values.category)))
        errors.push({ row: r.row, message: `Category "${r.values.category}" isn't in Master data → Part categories.` });
      if (r.values.hsn && !refs.hsn.has(lc(r.values.hsn)))
        errors.push({ row: r.row, message: `HSN code ${r.values.hsn} isn't in Master data → HSN / SAC codes.` });
      if (r.values.gstRate !== null && !refs.taxRates.has(Number(r.values.gstRate)))
        errors.push({ row: r.row, message: `GST ${r.values.gstRate}% isn't in Master data → GST rates.` });
      if (r.values.openingBranch) {
        const b = refs.branches.get(lc(r.values.openingBranch));
        if (!b) errors.push({ row: r.row, message: `Branch code "${r.values.openingBranch}" doesn't exist.` });
        else if (!canAccessBranch(ctx.user.access, "inventory.adjust", b.id))
          errors.push({ row: r.row, message: `You can't add stock in branch ${b.code} (needs “Adjust stock”).` });
      }
    }
  }
  errors.sort((a, b) => a.row - b.row);
  return { rows, errors, refs, total: raw.length };
}

export async function checkImport(ctx: ActionContext, entity: ImportEntity, buffer: ArrayBuffer): Promise<CheckResult> {
  const { rows, errors, total } = await validate(ctx, entity, buffer);
  const bad = new Set(errors.map((e) => e.row));
  // (rows with problems are counted as not ready)
  return {
    total,
    valid: rows.filter((r) => !bad.has(r.row)).length,
    errors: errors.slice(0, 200),
    sample: rows.slice(0, 5).map((r) => r.values),
  };
}

/** All or nothing: refuses to import while any row has an error. */
export async function runImport(ctx: ActionContext, entity: ImportEntity, buffer: ArrayBuffer, fileId: string) {
  const { rows, errors, refs, total } = await validate(ctx, entity, buffer);
  if (errors.length) throw new ActionError(`Fix the ${errors.length} problem(s) first, then upload again.`);
  const orgId = ctx.user.organizationId;
  const lc = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase();
  const d = (ymd: unknown) => (ymd ? new Date(`${ymd}T00:00:00.000Z`) : null);

  await db.$transaction(
    async (tx: Tx) => {
      for (const r of rows) {
        const v = r.values;
        if (entity === "students") {
          const branch = refs.branches.get(lc(v.branchCode))!;
          const studentCode = await nextDocNumber(tx, { branchId: branch.id, docType: "STUDENT_ID" });
          await tx.student.create({
            data: {
              organizationId: orgId,
              branchId: branch.id,
              studentCode,
              name: String(v.name),
              phone: String(v.phone),
              email: (v.email as string) ?? null,
              guardianName: (v.guardianName as string) ?? null,
              guardianPhone: (v.guardianPhone as string) ?? null,
              dob: d(v.dob),
              address: (v.address as string) ?? null,
              city: (v.city as string) ?? null,
              pincode: (v.pincode as string) ?? null,
            },
          });
        } else if (entity === "employees") {
          const branch = refs.branches.get(lc(v.branchCode))!;
          const employeeCode = await nextDocNumber(tx, { branchId: branch.id, docType: "EMPLOYEE_ID" });
          await tx.employee.create({
            data: {
              organizationId: orgId,
              branchId: branch.id,
              employeeCode,
              name: String(v.name),
              phone: String(v.phone),
              email: (v.email as string) ?? null,
              departmentId: v.department ? refs.departments.get(lc(v.department)) : null,
              designationId: v.designation ? refs.designations.get(lc(v.designation)) : null,
              joinDate: d(v.joinDate)!,
            },
          });
        } else {
          const part = await tx.part.create({
            data: {
              organizationId: orgId,
              sku: String(v.sku),
              name: String(v.name),
              kind: v.kind ? PART_KINDS[lc(v.kind)] : "SPARE_PART",
              categoryId: v.category ? refs.categories.get(lc(v.category)) : null,
              unitId: refs.units.get(lc(v.unit))!,
              hsnSacId: v.hsn ? refs.hsn.get(lc(v.hsn)) : null,
              taxRateId: v.gstRate !== null ? refs.taxRates.get(Number(v.gstRate)) : null,
              defaultSalePrice: v.salePrice === null ? null : String(v.salePrice),
              reorderLevel: v.reorderLevel === null ? 0 : String(v.reorderLevel),
            },
          });
          if (v.openingBranch && Number(v.openingQty) > 0) {
            await receiveStock(tx, {
              organizationId: orgId,
              branchId: refs.branches.get(lc(v.openingBranch))!.id,
              partId: part.id,
              qty: Number(v.openingQty),
              unitCost: Number(v.openingCost),
              type: "OPENING",
              refType: "Import",
              note: "Opening stock (import)",
              userId: ctx.user.id,
            });
          }
        }
      }
      const job = await tx.importJob.create({
        data: {
          organizationId: orgId,
          entity,
          fileId,
          status: "COMPLETED",
          totalRows: total,
          successRows: rows.length,
          errorRows: 0,
          createdById: ctx.user.id,
        },
      });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "ImportJob",
        entityId: job.id,
        after: { entity, rows: rows.length },
      });
    },
    { timeout: 120_000 },
  );
  return { imported: rows.length };
}
