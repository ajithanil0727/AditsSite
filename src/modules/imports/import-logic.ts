/**
 * Excel import rules (pure: no DB). Column specs per entity, cell parsing and row validation.
 * References (branch codes, departments, units…) and duplicates are checked by imports.service.ts.
 */
import { normalizeIndianPhone } from "@/lib/format";

export const IMPORT_ENTITIES = ["students", "employees", "parts"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];
export const MAX_ROWS = 2000;

type Kind = "text" | "phone" | "email" | "date" | "number" | "money";
export type ColumnSpec = {
  key: string;
  header: string;
  kind: Kind;
  required?: boolean;
  max?: number;
  example: string | number;
  help?: string;
};

export const IMPORT_SPECS: Record<
  ImportEntity,
  {
    label: string;
    permission: "students.import" | "employees.import" | "parts.import";
    columns: ColumnSpec[];
    note: string;
  }
> = {
  students: {
    label: "Students",
    permission: "students.import",
    note: "Adds student records only (no admission or fees): admit them to a course from their profile afterwards. A phone already used by a student is refused.",
    columns: [
      { key: "name", header: "Name", kind: "text", required: true, max: 100, example: "Anjali Menon" },
      { key: "phone", header: "Phone", kind: "phone", required: true, example: "9847012345" },
      { key: "email", header: "Email", kind: "email", example: "anjali@example.com" },
      { key: "guardianName", header: "Guardian name", kind: "text", max: 100, example: "Rajan Menon" },
      { key: "guardianPhone", header: "Guardian phone", kind: "phone", example: "9847000001" },
      { key: "dob", header: "Date of birth", kind: "date", example: "15/08/2004", help: "DD/MM/YYYY" },
      { key: "address", header: "Address", kind: "text", max: 300, example: "12 Temple Road" },
      { key: "city", header: "City", kind: "text", max: 80, example: "Palakkad" },
      { key: "pincode", header: "Pincode", kind: "text", max: 6, example: "678001" },
      {
        key: "branchCode",
        header: "Branch code",
        kind: "text",
        required: true,
        max: 4,
        example: "PKD",
        help: "PKD, MKM…",
      },
    ],
  },
  employees: {
    label: "Employees",
    permission: "employees.import",
    note: "Adds staff records (no salary): set each salary from the employee's page. Departments and designations must exist in Master data.",
    columns: [
      { key: "name", header: "Name", kind: "text", required: true, max: 100, example: "Sajeer K" },
      { key: "phone", header: "Phone", kind: "phone", required: true, example: "9847012399" },
      { key: "email", header: "Email", kind: "email", example: "sajeer@example.com" },
      { key: "branchCode", header: "Branch code", kind: "text", required: true, max: 4, example: "PKD" },
      { key: "department", header: "Department", kind: "text", max: 60, example: "Service" },
      { key: "designation", header: "Designation", kind: "text", max: 60, example: "Service engineer" },
      { key: "joinDate", header: "Joined on", kind: "date", required: true, example: "01/06/2025", help: "DD/MM/YYYY" },
    ],
  },
  parts: {
    label: "Parts",
    permission: "parts.import",
    note: "Adds parts to the catalogue. Optional opening stock goes into the branch given, at the unit cost given. An SKU that already exists is refused.",
    columns: [
      { key: "sku", header: "SKU", kind: "text", required: true, max: 40, example: "DSP-IP11-OEM" },
      { key: "name", header: "Name", kind: "text", required: true, max: 150, example: "iPhone 11 display (OEM)" },
      {
        key: "kind",
        header: "Kind",
        kind: "text",
        max: 20,
        example: "Spare part",
        help: "Spare part, IC, Consumable, Tool, Equipment",
      },
      { key: "category", header: "Category", kind: "text", max: 60, example: "Displays" },
      { key: "unit", header: "Unit", kind: "text", required: true, max: 20, example: "Nos" },
      { key: "hsn", header: "HSN code", kind: "text", max: 10, example: "8517" },
      { key: "gstRate", header: "GST %", kind: "number", example: 18 },
      { key: "salePrice", header: "Sale price (₹, incl. GST)", kind: "money", example: 4500 },
      { key: "reorderLevel", header: "Reorder level", kind: "number", example: 2 },
      { key: "openingBranch", header: "Opening stock branch", kind: "text", max: 4, example: "PKD" },
      { key: "openingQty", header: "Opening qty", kind: "number", example: 5 },
      { key: "openingCost", header: "Opening unit cost (₹)", kind: "money", example: 3200 },
    ],
  },
};

export const PART_KINDS: Record<string, "SPARE_PART" | "IC" | "CONSUMABLE" | "TOOL" | "EQUIPMENT"> = {
  "spare part": "SPARE_PART",
  spare: "SPARE_PART",
  ic: "IC",
  consumable: "CONSUMABLE",
  tool: "TOOL",
  equipment: "EQUIPMENT",
};

export type RawCell = string | number | boolean | Date | null | undefined;
export type ParsedValue = string | number | null;
export type ParsedRow = { row: number; values: Record<string, ParsedValue> };
export type RowError = { row: number; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DD/MM/YYYY, D-M-YYYY, YYYY-MM-DD or an Excel date → "YYYY-MM-DD". */
export function parseDate(v: RawCell): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function cellText(v: RawCell) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Checks one row against the spec. Empty rows are skipped by the caller. */
export function parseRow(
  entity: ImportEntity,
  rowNo: number,
  raw: Record<string, RawCell>,
): { row: ParsedRow; errors: RowError[] } {
  const errors: RowError[] = [];
  const values: Record<string, ParsedValue> = {};
  for (const c of IMPORT_SPECS[entity].columns) {
    const v = raw[c.key];
    const text = cellText(v);
    if (!text) {
      if (c.required) errors.push({ row: rowNo, message: `${c.header} is required.` });
      values[c.key] = null;
      continue;
    }
    if (c.kind === "text") {
      if (c.max && text.length > c.max) errors.push({ row: rowNo, message: `${c.header} is too long (max ${c.max}).` });
      values[c.key] = text;
    } else if (c.kind === "phone") {
      const p = normalizeIndianPhone(text);
      if (!p) errors.push({ row: rowNo, message: `${c.header} "${text}" isn't a valid 10-digit mobile number.` });
      values[c.key] = p ?? null;
    } else if (c.kind === "email") {
      if (!EMAIL.test(text)) errors.push({ row: rowNo, message: `${c.header} "${text}" isn't a valid email.` });
      values[c.key] = text.toLowerCase();
    } else if (c.kind === "date") {
      const d = parseDate(v);
      if (!d) errors.push({ row: rowNo, message: `${c.header} "${text}" isn't a date (use DD/MM/YYYY).` });
      values[c.key] = d;
    } else {
      const n = typeof v === "number" ? v : Number(text.replace(/[₹,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) errors.push({ row: rowNo, message: `${c.header} "${text}" isn't a number.` });
      else values[c.key] = c.kind === "money" ? Math.round(n * 100) / 100 : n;
      if (!Number.isFinite(n) || n < 0) values[c.key] = null;
    }
  }
  if (entity === "parts") {
    const kind = values.kind;
    if (kind && !PART_KINDS[String(kind).toLowerCase()])
      errors.push({ row: rowNo, message: `Kind "${kind}" isn't one of: Spare part, IC, Consumable, Tool, Equipment.` });
    const gst = values.gstRate;
    if (gst !== null && ![0, 5, 12, 18, 28].includes(Number(gst)))
      errors.push({ row: rowNo, message: `GST % must be 0, 5, 12, 18 or 28.` });
    const hasOpening = values.openingBranch || values.openingQty || values.openingCost;
    if (hasOpening && (!values.openingBranch || !values.openingQty || values.openingCost === null))
      errors.push({ row: rowNo, message: "For opening stock, fill the branch, qty and unit cost." });
  }
  // The row is returned even with errors so database checks (duplicates, branch codes…) can report everything at once.
  return { row: { row: rowNo, values }, errors };
}

/** Maps sheet headers to column keys (case and spacing don't matter). Returns missing required headers. */
export function mapHeaders(entity: ImportEntity, headers: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index: Record<string, number> = {};
  for (const c of IMPORT_SPECS[entity].columns) {
    const i = headers.findIndex((h) => norm(h) === norm(c.header));
    if (i >= 0) index[c.key] = i;
  }
  const missing = IMPORT_SPECS[entity].columns
    .filter((c) => c.required && index[c.key] === undefined)
    .map((c) => c.header);
  return { index, missing };
}

/** Duplicate values inside the file itself (e.g. the same phone twice). */
export function duplicatesInFile(rows: ParsedRow[], key: string, label: string): RowError[] {
  const seen = new Map<string, number>();
  const out: RowError[] = [];
  for (const r of rows) {
    const v = r.values[key];
    if (v === null || v === "") continue;
    const k = String(v).toLowerCase();
    if (seen.has(k)) out.push({ row: r.row, message: `${label} ${v} is also on row ${seen.get(k)}.` });
    else seen.set(k, r.row);
  }
  return out;
}
