/**
 * Simple master-data lists, defined once and edited through one generic screen.
 * Pure (no DB): shared by the client form and the server action. DB access lives in masters.service.ts.
 */
import { z } from "zod";
import { GSTIN_REGEX, normalizeIndianPhone } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/india-states";
import type { PermissionKey } from "@/lib/permissions";

export type Option = { value: string; label: string };

export type MasterField =
  | {
      name: string;
      label: string;
      type: "text";
      required?: boolean;
      validate?: "gstin" | "phone" | "email" | "ifsc";
      max?: number;
      help?: string;
    }
  | {
      name: string;
      label: string;
      type: "number";
      required?: boolean;
      min?: number;
      max?: number;
      step?: number;
      help?: string;
    }
  | { name: string; label: string; type: "switch"; help?: string; default?: boolean }
  | { name: string; label: string; type: "select"; required?: boolean; options: Option[]; help?: string }
  /** Options loaded from another master (or branches) on the server. */
  | { name: string; label: string; type: "ref"; ref: MasterKind | "branch"; required?: boolean; help?: string };

export type MasterDef = {
  kind: MasterKind;
  label: string;
  singular: string;
  group: "Enquiries" | "Institute" | "Service" | "Inventory" | "Accounts" | "Purchase" | "HR";
  description: string;
  permission: PermissionKey;
  fields: MasterField[];
  /** Field names shown as table columns (first one is the title). */
  columns: string[];
};

export const MASTER_KINDS = [
  "leadSource",
  "leadStatus",
  "deviceType",
  "brand",
  "deviceModel",
  "problemCategory",
  "jobStatus",
  "warrantyRule",
  "serviceRate",
  "partCategory",
  "unit",
  "vendor",
  "paymentMode",
  "expenseCategory",
  "incomeCategory",
  "taxRate",
  "hsnSac",
  "moneyAccount",
  "department",
  "designation",
  "shift",
  "leaveType",
  "salaryComponent",
  "assessmentType",
] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

export const JOB_STATUS_KEYS = [
  "RECEIVED",
  "DIAGNOSIS",
  "QUOTE_SENT",
  "APPROVED",
  "REJECTED",
  "IN_REPAIR",
  "WAITING_PARTS",
  "QC",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

/** Badge colours are design tokens, never hex values. */
export const TONES: Option[] = [
  { value: "sky", label: "Sky" },
  { value: "lavender", label: "Lavender" },
  { value: "mint", label: "Mint" },
  { value: "peach", label: "Peach" },
  { value: "neutral", label: "Grey" },
];

const active = { name: "isActive", label: "Active", type: "switch", default: true } as const;
const sort = { name: "sortOrder", label: "Sort order", type: "number", min: 0, max: 999 } as const;

export const MASTERS: Record<MasterKind, MasterDef> = {
  leadSource: {
    kind: "leadSource",
    label: "Lead sources",
    singular: "lead source",
    group: "Enquiries",
    permission: "masters.crm",
    description: "Where enquiries come from: website, walk-in, phone, referral, Instagram…",
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 60 }, active],
    columns: ["name", "isActive"],
  },
  leadStatus: {
    kind: "leadStatus",
    label: "Lead statuses",
    singular: "lead status",
    group: "Enquiries",
    permission: "masters.crm",
    description: "The enquiry pipeline. Mark which status new leads start in, and which mean won or lost.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 40 },
      { name: "color", label: "Colour", type: "select", options: TONES },
      sort,
      { name: "isDefault", label: "New leads start here", type: "switch" },
      { name: "isWon", label: "Means won (admitted / job opened)", type: "switch" },
      { name: "isLost", label: "Means lost (asks for a reason)", type: "switch" },
      active,
    ],
    columns: ["name", "color", "sortOrder", "isDefault", "isWon", "isLost", "isActive"],
  },
  deviceType: {
    kind: "deviceType",
    label: "Device types",
    singular: "device type",
    group: "Service",
    permission: "masters.service",
    description: "Mobile, laptop, desktop, tablet…",
    fields: [{ name: "name", label: "Name", type: "text", required: true }, sort, active],
    columns: ["name", "sortOrder", "isActive"],
  },
  brand: {
    kind: "brand",
    label: "Brands",
    singular: "brand",
    group: "Service",
    permission: "masters.service",
    description: "Device brands.",
    fields: [{ name: "name", label: "Name", type: "text", required: true }, active],
    columns: ["name", "isActive"],
  },
  deviceModel: {
    kind: "deviceModel",
    label: "Device models",
    singular: "model",
    group: "Service",
    permission: "masters.service",
    description: "Models per brand and device type (optional: intake also accepts free text).",
    fields: [
      { name: "brandId", label: "Brand", type: "ref", ref: "brand", required: true },
      { name: "deviceTypeId", label: "Device type", type: "ref", ref: "deviceType", required: true },
      { name: "name", label: "Model", type: "text", required: true },
      active,
    ],
    columns: ["name", "brandId", "deviceTypeId", "isActive"],
  },
  problemCategory: {
    kind: "problemCategory",
    label: "Problem categories",
    singular: "problem category",
    group: "Service",
    permission: "masters.service",
    description: "Display, charging, no power, water damage…",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "deviceTypeId", label: "Only for device type", type: "ref", ref: "deviceType" },
      active,
    ],
    columns: ["name", "deviceTypeId", "isActive"],
  },
  jobStatus: {
    kind: "jobStatus",
    label: "Job card statuses",
    singular: "status",
    group: "Service",
    permission: "masters.service",
    description: "Rename, recolour and reorder statuses. The stage decides what the system allows next.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "systemKey",
        label: "Stage",
        type: "select",
        required: true,
        options: JOB_STATUS_KEYS.map((k) => ({ value: k, label: k.replace("_", " ") })),
      },
      { name: "color", label: "Colour", type: "select", options: TONES },
      sort,
      {
        name: "pausesTat",
        label: "Pauses turnaround clock",
        type: "switch",
        help: "e.g. waiting for the customer or for parts",
      },
      { name: "notifyCustomer", label: "Notify customer", type: "switch" },
      active,
    ],
    columns: ["name", "systemKey", "sortOrder", "pausesTat", "isActive"],
  },
  warrantyRule: {
    kind: "warrantyRule",
    label: "Warranty rules",
    singular: "warranty rule",
    group: "Service",
    permission: "masters.service",
    description: "Warranty days on repairs. The most specific matching rule wins.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "deviceTypeId", label: "Device type", type: "ref", ref: "deviceType" },
      { name: "problemCategoryId", label: "Problem category", type: "ref", ref: "problemCategory" },
      { name: "days", label: "Days", type: "number", required: true, min: 0, max: 3650 },
      { name: "isDefault", label: "Default rule", type: "switch", help: "Used when nothing more specific matches" },
      active,
    ],
    columns: ["name", "days", "deviceTypeId", "problemCategoryId", "isDefault", "isActive"],
  },
  serviceRate: {
    kind: "serviceRate",
    label: "Labour charges",
    singular: "labour charge",
    group: "Service",
    permission: "masters.service",
    description: "Standard labour charges (GST-inclusive).",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "amount", label: "Amount (₹, incl. GST)", type: "number", required: true, min: 0, step: 0.01 },
      { name: "deviceTypeId", label: "Device type", type: "ref", ref: "deviceType" },
      { name: "problemCategoryId", label: "Problem category", type: "ref", ref: "problemCategory" },
      { name: "hsnSacId", label: "SAC code", type: "ref", ref: "hsnSac" },
      { name: "taxRateId", label: "GST rate", type: "ref", ref: "taxRate" },
      active,
    ],
    columns: ["name", "amount", "deviceTypeId", "taxRateId", "isActive"],
  },
  partCategory: {
    kind: "partCategory",
    label: "Part categories",
    singular: "part category",
    group: "Inventory",
    permission: "masters.inventory",
    description: "Displays, batteries, ICs, tools…",
    fields: [{ name: "name", label: "Name", type: "text", required: true }, active],
    columns: ["name", "isActive"],
  },
  unit: {
    kind: "unit",
    label: "Units",
    singular: "unit",
    group: "Inventory",
    permission: "masters.inventory",
    description: "Piece, metre, gram…",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "symbol", label: "Symbol", type: "text", required: true, max: 10 },
    ],
    columns: ["name", "symbol"],
  },
  vendor: {
    kind: "vendor",
    label: "Vendors",
    singular: "vendor",
    group: "Purchase",
    permission: "vendors.manage",
    description: "Parts suppliers.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "contactPerson", label: "Contact person", type: "text" },
      { name: "phone", label: "Phone", type: "text", validate: "phone" },
      { name: "email", label: "Email", type: "text", validate: "email" },
      { name: "gstin", label: "GSTIN", type: "text", validate: "gstin" },
      {
        name: "stateCode",
        label: "State",
        type: "select",
        options: INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })),
      },
      { name: "address", label: "Address", type: "text", max: 300 },
      { name: "paymentTermsDays", label: "Payment terms (days)", type: "number", min: 0, max: 365 },
      active,
    ],
    columns: ["name", "phone", "gstin", "isActive"],
  },
  paymentMode: {
    kind: "paymentMode",
    label: "Payment modes",
    singular: "payment mode",
    group: "Accounts",
    permission: "masters.accounts",
    description: "Cash, UPI, card, bank transfer, cheque…",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "requiresReference", label: "Needs a reference no.", type: "switch", help: "UPI ref, cheque no., …" },
      sort,
      active,
    ],
    columns: ["name", "requiresReference", "sortOrder", "isActive"],
  },
  taxRate: {
    kind: "taxRate",
    label: "GST rates",
    singular: "GST rate",
    group: "Accounts",
    permission: "masters.accounts",
    description: "GST slabs used on parts, labour and courses.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "rate", label: "Rate (%)", type: "number", required: true, min: 0, max: 28, step: 0.01 },
      active,
    ],
    columns: ["name", "rate", "isActive"],
  },
  hsnSac: {
    kind: "hsnSac",
    label: "HSN / SAC codes",
    singular: "HSN/SAC code",
    group: "Accounts",
    permission: "masters.accounts",
    description: "HSN for goods (parts), SAC for services (labour, courses).",
    fields: [
      { name: "code", label: "Code", type: "text", required: true, max: 8 },
      { name: "description", label: "Description", type: "text", required: true },
      { name: "isService", label: "Service (SAC)", type: "switch" },
      { name: "defaultTaxRateId", label: "Default GST rate", type: "ref", ref: "taxRate" },
      active,
    ],
    columns: ["code", "description", "isService", "defaultTaxRateId", "isActive"],
  },
  expenseCategory: {
    kind: "expenseCategory",
    label: "Expense categories",
    singular: "expense category",
    group: "Accounts",
    permission: "masters.accounts",
    description: "Rent, electricity, salaries, marketing… Each becomes a line in the profit & loss report.",
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 80 }, active],
    columns: ["name", "isActive"],
  },
  incomeCategory: {
    kind: "incomeCategory",
    label: "Other income categories",
    singular: "income category",
    group: "Accounts",
    permission: "masters.accounts",
    description: "Income other than fees and repairs: workshops, scrap sales, interest…",
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 80 }, active],
    columns: ["name", "isActive"],
  },
  department: {
    kind: "department",
    label: "Departments",
    singular: "department",
    group: "HR",
    permission: "masters.hr",
    description: "Training, Service, Front office, Accounts…",
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 60 }, active],
    columns: ["name", "isActive"],
  },
  designation: {
    kind: "designation",
    label: "Designations",
    singular: "designation",
    group: "HR",
    permission: "masters.hr",
    description: "Trainer, Service engineer, Counsellor, Branch manager…",
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 60 }, active],
    columns: ["name", "isActive"],
  },
  shift: {
    kind: "shift",
    label: "Shifts",
    singular: "shift",
    group: "HR",
    permission: "masters.hr",
    description: "Working hours. Sunday is the weekly off for everyone.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 40 },
      { name: "startTime", label: "Starts (HH:MM)", type: "text", required: true, max: 5 },
      { name: "endTime", label: "Ends (HH:MM)", type: "text", required: true, max: 5 },
      { name: "graceMinutes", label: "Late after (minutes)", type: "number", min: 0, max: 120 },
    ],
    columns: ["name", "startTime", "endTime"],
  },
  leaveType: {
    kind: "leaveType",
    label: "Leave types",
    singular: "leave type",
    group: "HR",
    permission: "masters.hr",
    description: "Days per financial year (April–March). Unpaid types count as loss of pay.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 40 },
      { name: "annualQuota", label: "Days per year", type: "number", required: true, min: 0, max: 365, step: 0.5 },
      { name: "isPaid", label: "Paid leave", type: "switch", default: true },
      { name: "carryForward", label: "Unused days carry forward", type: "switch" },
      active,
    ],
    columns: ["name", "annualQuota", "isPaid", "isActive"],
  },
  assessmentType: {
    kind: "assessmentType",
    label: "Assessment types",
    singular: "assessment type",
    group: "Institute",
    permission: "assessments.manage",
    description: "Theory, Practical, Project… Every assessment in a batch has a type.",
    fields: [{ name: "name", label: "Name", type: "text", required: true, max: 60 }, active],
    columns: ["name", "isActive"],
  },
  salaryComponent: {
    kind: "salaryComponent",
    label: "Salary components",
    singular: "salary component",
    group: "HR",
    permission: "masters.hr",
    description: "Earnings (Basic, HRA, allowances) and fixed deductions (uniform, mess…). No PF/ESI/PT/TDS.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 60 },
      {
        name: "type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          { value: "EARNING", label: "Earning" },
          { value: "DEDUCTION", label: "Deduction" },
        ],
      },
      sort,
      active,
    ],
    columns: ["name", "type", "sortOrder", "isActive"],
  },
  moneyAccount: {
    kind: "moneyAccount",
    label: "Cash & bank accounts",
    singular: "account",
    group: "Accounts",
    permission: "accounts.manage_accounts",
    description: "Where money is received and paid from, per branch.",
    fields: [
      { name: "branchId", label: "Branch", type: "ref", ref: "branch", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          { value: "CASH", label: "Cash" },
          { value: "BANK", label: "Bank" },
        ],
      },
      { name: "bankName", label: "Bank", type: "text" },
      { name: "accountNo", label: "Account no.", type: "text", max: 30 },
      { name: "ifsc", label: "IFSC", type: "text", validate: "ifsc" },
      { name: "openingBalance", label: "Opening balance (₹)", type: "number", min: -100000000, step: 0.01 },
      active,
    ],
    columns: ["name", "branchId", "type", "isActive"],
  },
};

export function isMasterKind(v: string): v is MasterKind {
  return (MASTER_KINDS as readonly string[]).includes(v);
}

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Zod schema for one master, built from its field list. Empty optional values become null. */
export function masterSchema(def: MasterDef) {
  const shape: Record<string, z.ZodType> = { id: z.string().optional() };
  for (const f of def.fields) {
    switch (f.type) {
      case "switch":
        shape[f.name] = z.boolean().default(f.default ?? false);
        break;
      case "number": {
        let n = z.number({ message: f.required ? `${f.label} is required` : `${f.label}: enter a number` });
        if (f.min !== undefined) n = n.min(f.min, `${f.label}: at least ${f.min}`);
        if (f.max !== undefined) n = n.max(f.max, `${f.label}: at most ${f.max}`);
        const toNumber = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));
        shape[f.name] = f.required
          ? z.preprocess(toNumber, n)
          : z.preprocess(toNumber, n.optional()).transform((v) => v ?? null);
        break;
      }
      case "text": {
        const base = z
          .string()
          .trim()
          .max(f.max ?? 200);
        const check = (v: string, ctx: z.RefinementCtx) => {
          if (!v) return v;
          if (f.validate === "gstin" && !GSTIN_REGEX.test(v.toUpperCase()))
            ctx.addIssue({ code: "custom", message: "Enter a valid GSTIN" });
          if (f.validate === "ifsc" && !IFSC_REGEX.test(v.toUpperCase()))
            ctx.addIssue({ code: "custom", message: "Enter a valid IFSC" });
          if (f.validate === "email" && !z.email().safeParse(v).success)
            ctx.addIssue({ code: "custom", message: "Enter a valid email" });
          if (f.validate === "phone") {
            const p = normalizeIndianPhone(v);
            if (!p) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number" });
            return p ?? v;
          }
          return f.validate === "gstin" || f.validate === "ifsc" ? v.toUpperCase() : v;
        };
        shape[f.name] = f.required
          ? base.min(1, `${f.label} is required`).transform(check)
          : base
              .optional()
              .nullable()
              .transform((v, ctx) => (v ? check(v, ctx) : null));
        break;
      }
      case "select":
      case "ref":
        shape[f.name] = f.required
          ? z.string({ message: `Select ${f.label.toLowerCase()}` }).min(1, `Select ${f.label.toLowerCase()}`)
          : z
              .string()
              .optional()
              .nullable()
              .transform((v) => v || null);
        break;
    }
  }
  return z.object(shape);
}

export function emptyValues(def: MasterDef): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const f of def.fields)
    v[f.name] = f.type === "switch" ? (f.default ?? false) : f.type === "number" ? "" : f.type === "text" ? "" : null;
  return v;
}
