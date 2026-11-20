import { z } from "zod";

/** Credit note form (shared by the dialog and the server). */
export const creditNoteSchema = z
  .object({
    invoiceId: z.string().min(1),
    amount: z.coerce.number({ message: "Enter the amount" }).positive("Must be more than zero").max(10_000_000),
    reason: z.string().trim().min(3, "Give a reason").max(300),
    refund: z.boolean(),
    paymentModeId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null),
    moneyAccountId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null),
    reference: z
      .string()
      .trim()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.refund && !v.paymentModeId)
      ctx.addIssue({ code: "custom", path: ["paymentModeId"], message: "Select how it's paid back" });
    if (v.refund && !v.moneyAccountId)
      ctx.addIssue({ code: "custom", path: ["moneyAccountId"], message: "Select the account" });
  });
export type CreditNoteInput = z.input<typeof creditNoteSchema>;
