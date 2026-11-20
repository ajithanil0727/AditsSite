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
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optYmd = ymd
  .or(z.literal(""))
  .optional()
  .nullable()
  .transform((v) => v || null);
const optMoney = z
  .union([z.literal(""), z.null(), z.coerce.number().min(0, "Can't be negative").max(100_000_000)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const companySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter the company name").max(120),
  industry: optText(80),
  website: z
    .string()
    .trim()
    .max(200)
    .url("Enter a full web address (https://…)")
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => v || null),
  city: optText(80),
  address: optText(300),
  isActive: z.boolean(),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(2, "Enter the name").max(100),
        designation: optText(80),
        phone: optText(20),
        email: z
          .string()
          .trim()
          .email("Enter a valid email")
          .or(z.literal(""))
          .optional()
          .nullable()
          .transform((v) => v || null),
      }),
    )
    .max(20),
});
export type CompanyInput = z.input<typeof companySchema>;

export const DRIVE_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;
export const DRIVE_STATUS_LABELS: Record<(typeof DRIVE_STATUSES)[number], string> = {
  OPEN: "Open",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const driveSchema = z
  .object({
    id: z.string().optional(),
    companyId: z.string().min(1, "Select the company"),
    branchId: optId, // null = students of every branch
    title: z.string().trim().min(3, "Name the drive").max(120),
    jobRole: z.string().trim().min(2, "Enter the job role").max(120),
    description: optText(2000),
    location: optText(120),
    salaryMin: optMoney,
    salaryMax: optMoney,
    driveDate: optYmd,
    lastDateToApply: optYmd,
    courseIds: z.array(z.string().min(1)).max(50), // empty = any course
    status: z.enum(DRIVE_STATUSES),
  })
  .refine((v) => v.salaryMin === null || v.salaryMax === null || v.salaryMax >= v.salaryMin, {
    path: ["salaryMax"],
    message: "Can't be less than the minimum",
  });
export type DriveInput = z.input<typeof driveSchema>;

export const addApplicantsSchema = z.object({
  driveId: z.string().min(1),
  enrollmentIds: z.array(z.string().min(1)).min(1, "Pick at least one student").max(200),
});

export const APPLICATION_STATUSES = [
  "APPLIED",
  "SHORTLISTED",
  "IN_PROCESS",
  "SELECTED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export const APPLICATION_STATUS_LABELS: Record<(typeof APPLICATION_STATUSES)[number], string> = {
  APPLIED: "Applied",
  SHORTLISTED: "Shortlisted",
  IN_PROCESS: "Interviewing",
  SELECTED: "Selected",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};

export const applicationStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(APPLICATION_STATUSES),
  notes: optText(500),
});

export const ROUND_RESULTS = ["PENDING", "PASSED", "FAILED", "NO_SHOW"] as const;
export const ROUND_RESULT_LABELS: Record<(typeof ROUND_RESULTS)[number], string> = {
  PENDING: "Pending",
  PASSED: "Cleared",
  FAILED: "Not cleared",
  NO_SHOW: "Didn't attend",
};

export const roundSchema = z.object({
  id: z.string().optional(),
  applicationId: z.string().min(1),
  name: z.string().trim().min(2, "Name the round").max(80),
  scheduledAt: optYmd,
  result: z.enum(ROUND_RESULTS),
  remarks: optText(300),
});
export type RoundInput = z.input<typeof roundSchema>;

export const JOINING_STATUSES = ["PENDING", "JOINED", "DECLINED"] as const;
export const JOINING_STATUS_LABELS: Record<(typeof JOINING_STATUSES)[number], string> = {
  PENDING: "Joining",
  JOINED: "Joined",
  DECLINED: "Declined",
};

export const offerSchema = z.object({
  applicationId: z.string().min(1),
  offeredAt: ymd,
  designation: z.string().trim().min(2, "Enter the designation").max(120),
  ctcAnnual: optMoney,
  joiningDate: optYmd,
  joiningStatus: z.enum(JOINING_STATUSES),
});
export type OfferInput = z.input<typeof offerSchema>;
