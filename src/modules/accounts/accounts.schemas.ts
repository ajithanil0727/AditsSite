import { z } from "zod";

const optText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null);
export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Can't be negative").max(100_000_000);
const positive = z.coerce.number({ message: "Enter an amount" }).positive("Must be more than zero").max(100_000_000);

/** Pay now (cash/bank) or record as unpaid. */
const payment = z.object({
  payNow: z.boolean(),
  paymentModeId: optId,
  moneyAccountId: optId,
  reference: optText(60),
});

export const expenseSchema = z
  .object({
    branchId: z.string().min(1, "Select the branch"),
    categoryId: z.string().min(1, "Select the category"),
    vendorId: optId,
    date: ymd,
    amount: positive,
    gstAmount: money.optional().default(0),
    description: z.string().trim().min(3, "What was it for?").max(300),
    billNo: optText(60),
    billFileId: optId,
    payment,
  })
  .superRefine((v, ctx) => {
    if (v.payment.payNow) {
      if (!v.payment.paymentModeId)
        ctx.addIssue({ code: "custom", path: ["payment", "paymentModeId"], message: "Select how it was paid" });
      if (!v.payment.moneyAccountId)
        ctx.addIssue({ code: "custom", path: ["payment", "moneyAccountId"], message: "Select the account" });
    }
  });
export type ExpenseInput = z.input<typeof expenseSchema>;

export const expenseDecisionSchema = z.object({ id: z.string().min(1), approve: z.boolean(), note: optText(300) });

export const payExpenseSchema = z.object({
  id: z.string().min(1),
  paymentModeId: z.string().min(1, "Select how it was paid"),
  moneyAccountId: z.string().min(1, "Select the account"),
  reference: optText(60),
  paidOn: ymd,
});
export type PayExpenseInput = z.input<typeof payExpenseSchema>;

export const incomeSchema = z.object({
  branchId: z.string().min(1, "Select the branch"),
  categoryId: z.string().min(1, "Select the category"),
  date: ymd,
  amount: positive,
  description: z.string().trim().min(3, "What was it for?").max(300),
  paymentModeId: z.string().min(1, "Select how it was received"),
  moneyAccountId: z.string().min(1, "Select the account"),
});
export type IncomeInput = z.input<typeof incomeSchema>;

export const cancelEntrySchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const contraSchema = z
  .object({
    fromAccountId: z.string().min(1, "Select the account money leaves"),
    toAccountId: z.string().min(1, "Select the account money goes to"),
    date: ymd,
    amount: positive,
    note: optText(200),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Pick a different account" });
export type ContraInput = z.input<typeof contraSchema>;

// ------------------------------------------------------------------ partners

export const partnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter the name").max(100),
  phone: optText(15),
  email: z
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => v || null),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN")
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => v || null),
  userId: optId,
  isActive: z.boolean().default(true),
});
export type PartnerInput = z.input<typeof partnerSchema>;

/** The full share list for one branch from a date. Empty list = no shares from that date. */
export const shareSetSchema = z.object({
  branchId: z.string().min(1, "Select the branch"),
  effectiveFrom: ymd,
  shares: z
    .array(z.object({ partnerId: z.string().min(1), percent: z.coerce.number().min(0).max(100) }))
    .max(50)
    .transform((list) => list.filter((s) => s.percent > 0)),
  note: optText(200),
});
export type ShareSetInput = z.input<typeof shareSetSchema>;

export const PARTNER_TXN_TYPES = ["CAPITAL_IN", "CAPITAL_OUT", "DRAWING"] as const;
export const PARTNER_TXN_LABELS: Record<(typeof PARTNER_TXN_TYPES)[number], string> = {
  CAPITAL_IN: "Capital brought in",
  CAPITAL_OUT: "Capital taken back",
  DRAWING: "Drawing (advance on profit)",
};

export const partnerTxnSchema = z.object({
  partnerId: z.string().min(1),
  branchId: z.string().min(1, "Select the branch"),
  type: z.enum(PARTNER_TXN_TYPES),
  amount: positive,
  date: ymd,
  moneyAccountId: optId,
  note: optText(200),
});
export type PartnerTxnInput = z.input<typeof partnerTxnSchema>;

export const distributionRunSchema = z
  .object({ periodFrom: ymd, periodTo: ymd, note: optText(200) })
  .refine((v) => v.periodTo >= v.periodFrom, { path: ["periodTo"], message: "Must be on or after the start" });
export type DistributionRunInput = z.input<typeof distributionRunSchema>;

export const accountsSettingsSchema = z.object({
  expenseApprovalLimit: z.coerce.number().min(0, "Can't be negative").max(10_000_000),
});
export const ACCOUNTS_SETTINGS_KEY = "accounts";
export const DEFAULT_EXPENSE_APPROVAL_LIMIT = 5000;
