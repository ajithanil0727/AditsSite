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
const qty = z.coerce.number({ message: "Enter a quantity" }).positive("Must be more than zero").max(1_000_000);
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Can't be negative").max(100_000_000);

export const PART_KINDS = ["SPARE_PART", "IC", "CONSUMABLE", "TOOL", "EQUIPMENT"] as const;
export const PART_KIND_LABELS: Record<(typeof PART_KINDS)[number], string> = {
  SPARE_PART: "Spare part",
  IC: "IC",
  CONSUMABLE: "Consumable",
  TOOL: "Tool",
  EQUIPMENT: "Lab equipment",
};

export const partSchema = z.object({
  id: z.string().optional(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-_.]{1,39}$/, "Letters, digits, - _ . (2–40)"),
  name: z.string().trim().min(2, "Enter the part name").max(150),
  kind: z.enum(PART_KINDS),
  categoryId: optId,
  unitId: z.string().min(1, "Select a unit"),
  hsnSacId: optId,
  taxRateId: optId,
  defaultSalePrice: z.preprocess((v) => (v === "" || v == null ? null : v), money.nullable()),
  reorderLevel: z.coerce.number().min(0).max(1_000_000),
  brandText: optText(80),
  compatibleModels: optText(300),
  isActive: z.boolean(),
});
export type PartInput = z.input<typeof partSchema>;

export const ADJUST_TYPES = ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "INTERNAL_USE"] as const;
export const adjustSchema = z.object({
  branchId: z.string().min(1),
  partId: z.string().min(1, "Select a part"),
  type: z.enum(ADJUST_TYPES),
  qty,
  /** Only for ADJUSTMENT_IN; defaults to the current average cost. */
  unitCost: z.preprocess((v) => (v === "" || v == null ? null : v), money.nullable()),
  note: z.string().trim().min(3, "Say why (e.g. 'stock count correction')").max(300),
});
export type AdjustInput = z.input<typeof adjustSchema>;

const lineItem = z.object({ partId: z.string().min(1, "Select a part"), qty });

export const transferSchema = z
  .object({
    fromBranchId: z.string().min(1, "Select the sending branch"),
    toBranchId: z.string().min(1, "Select the receiving branch"),
    note: optText(),
    items: z.array(lineItem).min(1, "Add at least one part"),
  })
  .refine((v) => v.fromBranchId !== v.toBranchId, { path: ["toBranchId"], message: "Pick a different branch" });
export type TransferInput = z.input<typeof transferSchema>;

export const purchaseSchema = z.object({
  id: z.string().optional(),
  branchId: z.string().min(1, "Select the branch"),
  vendorId: z.string().min(1, "Select the vendor"),
  billNo: z.string().trim().min(1, "Enter the vendor's bill number").max(40),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the bill date"),
  notes: optText(),
  items: z
    .array(
      lineItem.extend({
        unitCost: money, // before GST
        taxRate: z.coerce.number().min(0).max(28),
      }),
    )
    .min(1, "Add at least one part"),
});
export type PurchaseInput = z.input<typeof purchaseSchema>;

export const vendorPaymentSchema = z.object({
  purchaseId: z.string().min(1),
  amount: z.coerce.number().positive("Must be more than zero"),
  paymentModeId: z.string().min(1, "Select a payment mode"),
  moneyAccountId: z.string().min(1, "Select the account"),
  reference: optText(60),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type VendorPaymentInput = z.input<typeof vendorPaymentSchema>;
