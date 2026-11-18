import { z } from "zod";
import { indianPhone } from "@/lib/format";

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
const optEmail = z
  .email("Enter a valid email")
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => v || null);
const optPhone = indianPhone
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => v || null);
/** "YYYY-MM-DDTHH:mm" from <input type="datetime-local">, read as IST. */
const optDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time")
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => v || null);

export const LEAD_TYPES = ["COURSE", "SERVICE"] as const;
export const LEAD_TYPE_LABELS: Record<(typeof LEAD_TYPES)[number], string> = {
  COURSE: "Course",
  SERVICE: "Repair",
};

/** Activities staff log by hand (status changes, assignments, enquiries and conversions are automatic). */
export const MANUAL_ACTIVITIES = ["NOTE", "CALL", "VISIT", "WHATSAPP"] as const;
export const ACTIVITY_LABELS: Record<string, string> = {
  NOTE: "Note",
  CALL: "Call",
  VISIT: "Visit",
  WHATSAPP: "WhatsApp",
  STATUS_CHANGE: "Status",
  ASSIGNMENT: "Assigned",
  ENQUIRY: "Enquired again",
  CONVERSION: "Converted",
};

/** IST "YYYY-MM-DDTHH:mm" → Date. */
export function istLocalToDate(v: string): Date {
  return new Date(`${v}:00.000+05:30`);
}

// ------------------------------------------------------------------ public forms

const spamFields = {
  /** Honeypot: hidden from people, bots fill it. */
  website: z.string().max(200).optional().nullable(),
  /** When the form was rendered (ms since epoch). */
  startedAt: z.coerce.number().int().nonnegative(),
};

export const courseEnquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone: indianPhone,
  email: optEmail,
  city: optText(80),
  branchId: z.string().min(1, "Choose the nearest branch"),
  courseId: optId,
  message: optText(1000),
  ...spamFields,
});
export type CourseEnquiryInput = z.input<typeof courseEnquirySchema>;

export const repairBookingSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone: indianPhone,
  email: optEmail,
  branchId: z.string().min(1, "Choose the nearest branch"),
  deviceTypeId: optId,
  deviceText: z.string().trim().min(2, "Which device? e.g. Samsung A52").max(100),
  problemText: z.string().trim().min(3, "Tell us what's wrong").max(1000),
  ...spamFields,
});
export type RepairBookingInput = z.input<typeof repairBookingSchema>;

// ------------------------------------------------------------------ staff

export const leadSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(LEAD_TYPES),
    branchId: z.string().min(1, "Select the branch"),
    sourceId: z.string().min(1, "Select the source"),
    name: z.string().trim().min(2, "Enter the name").max(100),
    phone: indianPhone,
    altPhone: optPhone,
    email: optEmail,
    city: optText(80),
    courseId: optId,
    deviceTypeId: optId,
    deviceText: optText(100),
    problemText: optText(1000),
    message: optText(1000),
    /** Only on create: empty = round-robin. */
    assignedToId: optId,
    nextFollowUpAt: optDateTime,
  })
  .superRefine((v, ctx) => {
    if (v.type === "SERVICE" && !v.deviceText && !v.deviceTypeId)
      ctx.addIssue({ code: "custom", path: ["deviceText"], message: "Which device?" });
  });
export type LeadInput = z.input<typeof leadSchema>;

export const activitySchema = z
  .object({
    leadId: z.string().min(1),
    kind: z.enum(MANUAL_ACTIVITIES),
    note: optText(1000),
    nextFollowUpAt: optDateTime,
    clearFollowUp: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.note && !v.nextFollowUpAt)
      ctx.addIssue({ code: "custom", path: ["note"], message: "Add a note or a follow-up date" });
  });
export type ActivityInput = z.input<typeof activitySchema>;

export const statusChangeSchema = z.object({
  leadId: z.string().min(1),
  statusId: z.string().min(1, "Pick a status"),
  lostReason: optText(300),
  note: optText(500),
});
export type StatusChangeInput = z.input<typeof statusChangeSchema>;

export const assignLeadSchema = z.object({
  leadId: z.string().min(1),
  assignedToId: optId,
});

export const deleteLeadSchema = z.object({ leadId: z.string().min(1), restore: z.boolean().optional() });
