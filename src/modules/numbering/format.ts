/** Pure number-series formatting (unit tested). */
import type { DocType } from "@/generated/prisma/enums";
import { financialYear, financialYearCompact } from "@/lib/fy";

/**
 * Tokens:
 *   {BRANCH} branch code (KOC)
 *   {FY}     financial year with dash (26-27)
 *   {FYS}    financial year compact (2627)
 *   {SEQ}    running number, zero-padded
 */
export const NUMBER_TOKENS = ["{BRANCH}", "{FY}", "{FYS}", "{SEQ}"] as const;

/** GST rule: invoice / credit note numbers must be at most 16 characters. */
export const GST_DOC_TYPES: readonly DocType[] = ["TAX_INVOICE", "BILL_OF_SUPPLY", "CREDIT_NOTE"];
export const GST_MAX_LENGTH = 16;
/** Longest branch code allowed: keeps GST invoice numbers within 16 characters. */
export const BRANCH_CODE_MAX = 4;

export function formatDocNumber(opts: {
  format: string;
  branchCode: string;
  date: Date;
  seq: number;
  padding: number;
}): string {
  return opts.format
    .replaceAll("{BRANCH}", opts.branchCode)
    .replaceAll("{FYS}", financialYearCompact(opts.date))
    .replaceAll("{FY}", financialYear(opts.date))
    .replaceAll("{SEQ}", String(opts.seq).padStart(opts.padding, "0"));
}

export type FormatCheck = { ok: true; example: string } | { ok: false; error: string; example?: string };

/** Validate a format string; for GST documents, check the longest realistic number fits in 16 chars. */
export function checkFormat(opts: {
  format: string;
  docType: DocType;
  branchCode: string;
  padding: number;
}): FormatCheck {
  if (!opts.format.includes("{SEQ}")) return { ok: false, error: "The format must contain {SEQ}." };
  const unknown = opts.format.match(/\{[A-Z]+\}/g)?.filter((t) => !NUMBER_TOKENS.includes(t as never));
  if (unknown?.length) return { ok: false, error: `Unknown token(s): ${unknown.join(", ")}` };

  const example = formatDocNumber({
    format: opts.format,
    branchCode: opts.branchCode,
    date: new Date(),
    seq: 10 ** opts.padding - 1, // longest number before the padding overflows
    padding: opts.padding,
  });
  if (GST_DOC_TYPES.includes(opts.docType) && example.length > GST_MAX_LENGTH) {
    return {
      ok: false,
      error: `GST invoice numbers can be at most ${GST_MAX_LENGTH} characters ("${example}" is ${example.length}).`,
      example,
    };
  }
  return { ok: true, example };
}

/**
 * Default formats per document type, seeded for each branch.
 * GST documents fit 16 characters with branch codes of up to 4 characters (BRANCH_CODE_MAX).
 */
export const DEFAULT_FORMATS: Record<DocType, { format: string; padding: number; reset?: "NEVER" }> = {
  JOB_CARD: { format: "{BRANCH}/JC/{FY}/{SEQ}", padding: 5 },
  QUOTATION: { format: "{BRANCH}/QT/{FY}/{SEQ}", padding: 5 },
  TAX_INVOICE: { format: "{BRANCH}/{FYS}/{SEQ}", padding: 5 },
  BILL_OF_SUPPLY: { format: "{BRANCH}/B{FYS}/{SEQ}", padding: 5 },
  NON_GST_INVOICE: { format: "{BRANCH}/NG{FYS}/{SEQ}", padding: 5 },
  CREDIT_NOTE: { format: "{BRANCH}/C{FYS}/{SEQ}", padding: 5 },
  FEE_RECEIPT: { format: "{BRANCH}/RC/{FY}/{SEQ}", padding: 5 },
  STUDENT_ID: { format: "{BRANCH}{FYS}{SEQ}", padding: 4 },
  CERTIFICATE: { format: "{BRANCH}/CERT/{FY}/{SEQ}", padding: 5 },
  PURCHASE: { format: "{BRANCH}/PU/{FY}/{SEQ}", padding: 5 },
  STOCK_TRANSFER: { format: "{BRANCH}/ST/{FY}/{SEQ}", padding: 5 },
  // No year in the code, so the series must never restart (PKD-E001 stays unique).
  EMPLOYEE_ID: { format: "{BRANCH}-E{SEQ}", padding: 3, reset: "NEVER" },
  SERVICE_RECEIPT: { format: "{BRANCH}/SR/{FY}/{SEQ}", padding: 5 },
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  JOB_CARD: "Job card",
  QUOTATION: "Quotation",
  TAX_INVOICE: "Tax invoice",
  BILL_OF_SUPPLY: "Bill of supply",
  NON_GST_INVOICE: "Non-GST invoice",
  CREDIT_NOTE: "Credit note",
  FEE_RECEIPT: "Fee receipt",
  STUDENT_ID: "Student ID",
  CERTIFICATE: "Certificate",
  PURCHASE: "Purchase",
  STOCK_TRANSFER: "Stock transfer",
  EMPLOYEE_ID: "Employee ID",
  SERVICE_RECEIPT: "Service receipt",
};
