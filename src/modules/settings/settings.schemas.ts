import { z } from "zod";
import { GSTIN_REGEX, PINCODE_REGEX, indianPhone } from "@/lib/format";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || undefined);

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(120),
  legalName: optionalText,
  tagline: optionalText,
  phone: indianPhone,
  email: z
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional()
    .transform((v) => v || undefined),
  website: z
    .url("Enter a full URL, e.g. https://example.com")
    .or(z.literal(""))
    .optional()
    .transform((v) => v || undefined),
  addressLine1: z.string().trim().min(3, "Enter the address").max(200),
  addressLine2: optionalText,
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Enter the state").max(80),
  pincode: z.string().trim().regex(PINCODE_REGEX, "Enter a valid 6-digit PIN code"),
  logoFileId: z.string().optional().nullable(),
});

export type CompanyProfile = z.output<typeof companyProfileSchema>;
export type CompanyProfileInput = z.input<typeof companyProfileSchema>;

export const gstRegistrationSchema = z.object({
  id: z.string().optional(),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_REGEX, "Enter a valid 15-character GSTIN"),
  legalName: z.string().trim().min(2, "Enter the legal name").max(150),
  tradeName: optionalText,
  stateName: z.string().trim().min(2, "Enter the state").max(80),
  address: z.string().trim().min(5, "Enter the registered address").max(300),
  isActive: z.boolean().default(true),
});
export type GstRegistrationInput = z.input<typeof gstRegistrationSchema>;

export const numberSeriesSchema = z.object({
  id: z.string(),
  format: z.string().trim().min(3).max(60),
  padding: z.coerce.number().int().min(1).max(8),
  nextNumber: z.coerce.number().int().min(1),
  resetPolicy: z.enum(["FINANCIAL_YEAR", "NEVER"]),
});
export type NumberSeriesInput = z.input<typeof numberSeriesSchema>;
