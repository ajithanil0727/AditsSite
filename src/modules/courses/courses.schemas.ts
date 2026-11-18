import { z } from "zod";

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
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const DURATION_UNITS = ["DAYS", "WEEKS", "MONTHS"] as const;
export const DURATION_LABELS: Record<(typeof DURATION_UNITS)[number], string> = {
  DAYS: "days",
  WEEKS: "weeks",
  MONTHS: "months",
};
export const GST_MODES = ["EXEMPT", "INCLUSIVE", "EXCLUSIVE"] as const;
export const GST_MODE_LABELS: Record<(typeof GST_MODES)[number], string> = {
  EXEMPT: "No GST (exempt)",
  INCLUSIVE: "GST included in fee",
  EXCLUSIVE: "GST added on top",
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const courseSchema = z
  .object({
    id: z.string().optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, "2–20 letters/digits/-"),
    name: z.string().trim().min(3, "Enter the course name").max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]*$/, "Lowercase letters, digits and -")
      .max(80)
      .optional()
      .default(""),
    durationValue: z.coerce.number().int().min(1, "At least 1").max(1000),
    durationUnit: z.enum(DURATION_UNITS),
    fee: z.coerce.number({ message: "Enter the fee" }).min(0).max(10_000_000),
    gstMode: z.enum(GST_MODES),
    taxRateId: optId,
    hsnSacId: optId,
    shortDescription: optText(300),
    eligibility: optText(300),
    showOnWebsite: z.boolean(),
    isFeatured: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(999),
  })
  .superRefine((v, ctx) => {
    if (v.gstMode !== "EXEMPT" && !v.taxRateId)
      ctx.addIssue({ code: "custom", path: ["taxRateId"], message: "Pick the GST rate" });
  });
export type CourseInput = z.input<typeof courseSchema>;

export const modulesSchema = z.object({
  courseId: z.string().min(1),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(2, "Enter the module title").max(150),
        hours: z.preprocess(
          (v) => (v === "" || v == null ? null : v),
          z.coerce.number().int().min(0).max(2000).nullable(),
        ),
      }),
    )
    .max(100),
});
export type ModulesInput = z.input<typeof modulesSchema>;

export const feePlanSchema = z
  .object({
    courseId: z.string().min(1),
    id: z.string().optional(),
    name: z.string().trim().min(2, "Name the plan, e.g. '3 instalments'").max(60),
    isActive: z.boolean(),
    items: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Label").max(60),
          percentOfFee: z.coerce.number().positive("> 0").max(100),
          dueAfterDays: z.coerce.number().int().min(0).max(1000),
        }),
      )
      .min(1, "Add at least one instalment")
      .max(24),
  })
  .superRefine((v, ctx) => {
    const sum = v.items.reduce((a, i) => a + Number(i.percentOfFee), 0);
    if (Math.abs(sum - 100) > 0.001)
      ctx.addIssue({ code: "custom", path: ["items"], message: `Percentages add up to ${sum}%, not 100%.` });
  });
export type FeePlanInput = z.input<typeof feePlanSchema>;

export const BATCH_STATUSES = ["PLANNED", "ONGOING", "COMPLETED", "CANCELLED"] as const;
export const BATCH_STATUS_LABELS: Record<(typeof BATCH_STATUSES)[number], string> = {
  PLANNED: "Planned",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const batchSchema = z.object({
  id: z.string().optional(),
  branchId: z.string().min(1, "Select the branch"),
  courseId: z.string().min(1, "Select the course"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-/]{2,30}$/, "2–30 letters/digits/-/"),
  name: z.string().trim().min(2, "Name the batch").max(80),
  trainerId: optId,
  startDate: ymd,
  endDate: ymd
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  timing: z.string().trim().min(3, "e.g. 10:00–13:00").max(40),
  days: optText(40),
  capacity: z.coerce.number().int().min(1).max(500),
  status: z.enum(BATCH_STATUSES),
});
export type BatchInput = z.input<typeof batchSchema>;
