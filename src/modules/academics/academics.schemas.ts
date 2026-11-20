import { z } from "zod";

const optText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const marksNum = z.coerce.number({ message: "Enter a number" }).min(0, "Can't be negative").max(1000);

export const assessmentSchema = z
  .object({
    id: z.string().optional(),
    batchId: z.string().min(1, "Select the batch"),
    typeId: z.string().min(1, "Select the type"),
    title: z.string().trim().min(2, "Name the assessment").max(120),
    date: ymd,
    maxMarks: marksNum.positive("Must be more than zero"),
    passMarks: marksNum,
  })
  .refine((v) => v.passMarks <= v.maxMarks, { path: ["passMarks"], message: "Can't be more than the maximum" });
export type AssessmentInput = z.input<typeof assessmentSchema>;

export const marksSchema = z.object({
  assessmentId: z.string().min(1),
  rows: z
    .array(
      z.object({
        enrollmentId: z.string().min(1),
        // "" = not entered yet
        marks: z
          .union([z.literal(""), z.null(), marksNum])
          .optional()
          .transform((v) => (v === "" || v === undefined ? null : v)),
        isAbsent: z.boolean(),
        remarks: optText(200),
      }),
    )
    .min(1, "No students to mark"),
});
export type MarksInput = z.input<typeof marksSchema>;

export const issueCertificateSchema = z.object({ enrollmentId: z.string().min(1), issuedAt: ymd });
export type IssueCertificateInput = z.input<typeof issueCertificateSchema>;

export const revokeCertificateSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(5, "Say why it is cancelled").max(300),
});
export type RevokeCertificateInput = z.input<typeof revokeCertificateSchema>;

export const certificateRulesSchema = z.object({
  minAttendance: z.coerce.number().min(0).max(100),
  passPercent: z.coerce.number().min(0).max(100),
  grades: z
    .array(z.object({ grade: z.string().trim().min(1, "Name it").max(6), min: z.coerce.number().min(0).max(100) }))
    .min(1, "Add at least one grade")
    .max(10),
});
export type CertificateRulesInput = z.input<typeof certificateRulesSchema>;
export const CERTIFICATE_RULES_KEY = "certificates";

export const placementOptOutSchema = z.object({ enrollmentId: z.string().min(1), optOut: z.boolean() });
