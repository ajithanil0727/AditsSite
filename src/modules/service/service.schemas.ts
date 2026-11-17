import { z } from "zod";
import { GSTIN_REGEX, indianPhone } from "@/lib/format";

const optText = (max = 500) =>
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
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Can't be negative").max(10_000_000);
const optMoney = z.preprocess((v) => (v === "" || v == null ? null : v), money.nullable());
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const intakeSchema = z
  .object({
    branchId: z.string().min(1, "Select the branch"),
    // Customer: existing id, or new details
    customerId: optId,
    customerName: z.string().trim().max(100).optional().default(""),
    customerPhone: indianPhone,
    customerAltPhone: indianPhone
      .or(z.literal(""))
      .optional()
      .transform((v) => v || null),
    customerEmail: z
      .email("Enter a valid email")
      .or(z.literal(""))
      .optional()
      .transform((v) => v || null),
    customerAddress: optText(300),
    customerGstin: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => !v || GSTIN_REGEX.test(v), "Enter a valid GSTIN"),
    // Device: existing id, or new details
    deviceId: optId,
    deviceTypeId: z.string().min(1, "Select the device type"),
    brandId: optId,
    modelId: optId,
    modelText: optText(80),
    imei: optText(20),
    serialNo: optText(40),
    color: optText(30),
    // Problem & condition
    problemCategoryId: optId,
    problemReported: z.string().trim().min(3, "Describe the problem").max(1000),
    accessories: z.array(z.string().trim().min(1).max(40)).max(20),
    conditionNotes: optText(1000),
    unlockCode: optText(100),
    // Promise
    estimatedAt: ymd
      .optional()
      .or(z.literal(""))
      .transform((v) => v || null),
    estimatedCost: optMoney,
    priority: z.enum(PRIORITIES),
    assignedEngineerId: optId,
    // Warranty comeback
    parentJobId: optId,
    // Advance
    advanceAmount: optMoney,
    advanceModeId: optId,
    advanceAccountId: optId,
    advanceReference: optText(60),
  })
  .superRefine((v, ctx) => {
    if (!v.customerId && v.customerName.trim().length < 2) {
      ctx.addIssue({ code: "custom", path: ["customerName"], message: "Enter the customer's name" });
    }
    if (v.advanceAmount && v.advanceAmount > 0) {
      if (!v.advanceModeId)
        ctx.addIssue({ code: "custom", path: ["advanceModeId"], message: "Select how it was paid" });
      if (!v.advanceAccountId)
        ctx.addIssue({ code: "custom", path: ["advanceAccountId"], message: "Select the account" });
    }
  });
export type IntakeInput = z.input<typeof intakeSchema>;

export const jobIdSchema = z.object({ jobId: z.string().min(1) });

export const statusChangeSchema = z.object({
  jobId: z.string().min(1),
  statusId: z.string().min(1, "Pick a status"),
  note: optText(500),
  diagnosis: optText(2000),
});

export const assignSchema = z.object({ jobId: z.string().min(1), engineerId: optId, priority: z.enum(PRIORITIES) });

export const noteSchema = z.object({
  jobId: z.string().min(1),
  note: z.string().trim().min(1, "Write a note").max(2000),
  customerVisible: z.boolean(),
});

export const labourSchema = z.object({
  jobId: z.string().min(1),
  serviceRateId: optId,
  description: z.string().trim().min(2, "Describe the work").max(200),
  amount: money,
});

export const removeLineSchema = z.object({ jobId: z.string().min(1), lineId: z.string().min(1) });

export const partRequestSchema = z.object({
  jobId: z.string().min(1),
  partId: z.string().min(1, "Select a part"),
  qty: z.coerce.number().positive("Must be more than zero").max(1000),
  note: optText(300),
});

/** Store issues a part to a job (from a request, or directly). */
export const issuePartSchema = z.object({
  jobId: z.string().min(1),
  partId: z.string().min(1, "Select a part"),
  qty: z.coerce.number().positive("Must be more than zero").max(1000),
  unitPrice: optMoney, // defaults to the part's sale price
  requestId: optId,
});

export const returnPartSchema = z.object({
  jobId: z.string().min(1),
  jobPartId: z.string().min(1),
  qty: z.coerce.number().positive().max(1000),
});

export const rejectRequestSchema = z.object({ requestId: z.string().min(1), note: optText(300) });

export const freePartSchema = z.object({ jobId: z.string().min(1), jobPartId: z.string().min(1), free: z.boolean() });
export const warrantyPartsFreeSchema = z.object({ jobId: z.string().min(1), free: z.boolean() });

export const quoteSchema = z.object({
  jobId: z.string().min(1),
  validUntil: ymd
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  items: z
    .array(
      z.object({
        kind: z.enum(["PART", "LABOUR", "OTHER"]),
        partId: optId,
        serviceRateId: optId,
        description: z.string().trim().min(2, "Describe the line").max(200),
        qty: z.coerce.number().positive().max(1000),
        unitPrice: money, // GST-inclusive
      }),
    )
    .min(1, "Add at least one line"),
});
export type QuoteInput = z.input<typeof quoteSchema>;

export const quoteDecisionSchema = z.object({
  jobId: z.string().min(1),
  quotationId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  via: z.enum(["IN_PERSON", "PHONE", "WHATSAPP", "PORTAL"]),
  note: optText(500),
});

export const paymentSchema = z.object({
  jobId: z.string().min(1),
  kind: z.enum(["ADVANCE", "PAYMENT", "REFUND"]),
  amount: z.coerce.number().positive("Must be more than zero").max(10_000_000),
  paymentModeId: z.string().min(1, "Select a mode"),
  moneyAccountId: z.string().min(1, "Select the account"),
  reference: optText(60),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const cancelJobSchema = z.object({
  jobId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
export const deliverSchema = z.object({ jobId: z.string().min(1), onCredit: z.boolean() });
export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
