import { z } from "zod";
import { PINCODE_REGEX, indianPhone } from "@/lib/format";

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
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optYmd = ymd
  .optional()
  .or(z.literal(""))
  .nullable()
  .transform((v) => v || null);
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Can't be negative").max(10_000_000);
const optMoney = z.preprocess((v) => (v === "" || v == null ? null : v), money.nullable());
const optPhone = indianPhone
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => v || null);

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

export const studentDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the student's name").max(100),
  phone: indianPhone,
  altPhone: optPhone,
  email: z
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => v || null),
  dob: optYmd,
  gender: z
    .enum(GENDERS)
    .optional()
    .nullable()
    .transform((v) => v || null),
  guardianName: optText(100),
  guardianPhone: optPhone,
  address: optText(300),
  city: optText(80),
  state: optText(80),
  pincode: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => !v || PINCODE_REGEX.test(v), "Enter a valid 6-digit PIN code"),
  qualification: optText(150),
});

const scheduleLine = z.object({
  label: z.string().trim().min(1, "Label").max(60),
  amount: money,
  dueDate: ymd,
});

const firstPayment = z.object({
  amount: optMoney,
  paymentModeId: optId,
  moneyAccountId: optId,
  reference: optText(60),
});

export const admissionSchema = z
  .object({
    branchId: z.string().min(1, "Select the branch"),
    studentId: optId, // existing student (second course)
    leadId: optId, // converting this enquiry
    student: studentDetailsSchema,
    courseId: z.string().min(1, "Select the course"),
    batchId: optId,
    enrolledAt: ymd,
    discountAmount: optMoney,
    discountReason: optText(300),
    schedule: z.array(scheduleLine).min(1, "Add at least one instalment"),
    payment: firstPayment,
  })
  .superRefine((v, ctx) => {
    if ((v.discountAmount ?? 0) > 0 && !v.discountReason) {
      ctx.addIssue({ code: "custom", path: ["discountReason"], message: "Give a reason for the discount" });
    }
    if ((v.payment.amount ?? 0) > 0) {
      if (!v.payment.paymentModeId)
        ctx.addIssue({ code: "custom", path: ["payment", "paymentModeId"], message: "Select how it was paid" });
      if (!v.payment.moneyAccountId)
        ctx.addIssue({ code: "custom", path: ["payment", "moneyAccountId"], message: "Select the account" });
    }
  });
export type AdmissionInput = z.input<typeof admissionSchema>;

export const updateStudentSchema = studentDetailsSchema.extend({ id: z.string().min(1) });
export type UpdateStudentInput = z.input<typeof updateStudentSchema>;

export const collectFeeSchema = z.object({
  enrollmentId: z.string().min(1),
  amount: z.coerce.number().positive("Must be more than zero").max(10_000_000),
  paymentModeId: z.string().min(1, "Select how it was paid"),
  moneyAccountId: z.string().min(1, "Select the account"),
  reference: optText(60),
  paidAt: ymd,
  notes: optText(300),
});
export type CollectFeeInput = z.input<typeof collectFeeSchema>;

export const cancelReceiptSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const discountRequestSchema = z.object({
  enrollmentId: z.string().min(1),
  amount: z.coerce.number().positive("Must be more than zero").max(10_000_000),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const decisionSchema = z.object({ id: z.string().min(1), approve: z.boolean(), note: optText(300) });

export const refundRequestSchema = z.object({
  enrollmentId: z.string().min(1),
  amount: z.coerce.number().positive("Must be more than zero").max(10_000_000),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const payRefundSchema = z.object({
  id: z.string().min(1),
  paymentModeId: z.string().min(1, "Select how it was paid"),
  moneyAccountId: z.string().min(1, "Select the account"),
});

export const transferSchema = z.object({
  enrollmentId: z.string().min(1),
  toBranchId: z.string().min(1, "Select the branch"),
  toBatchId: optId,
  reason: optText(300),
});

export const dropSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
export const completeSchema = z.object({ enrollmentId: z.string().min(1) });
export const waiveSchema = z.object({
  instalmentId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});

export const ATTENDANCE = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE", "HOLIDAY"] as const;
export const ATTENDANCE_LABELS: Record<(typeof ATTENDANCE)[number], string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  HALF_DAY: "Half day",
  LEAVE: "Leave",
  HOLIDAY: "Holiday",
};

export const attendanceSchema = z.object({
  batchId: z.string().min(1),
  date: ymd,
  topic: optText(200),
  records: z
    .array(z.object({ enrollmentId: z.string().min(1), status: z.enum(ATTENDANCE) }))
    .min(1, "No students to mark"),
});
export type AttendanceInput = z.input<typeof attendanceSchema>;
