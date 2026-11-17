import { z } from "zod";
import { PINCODE_REGEX, indianPhone } from "@/lib/format";
import { STATE_CODES } from "@/lib/india-states";

const optional = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null);

export const BRANCH_KINDS = ["INSTITUTE", "SERVICE", "BOTH", "HEAD_OFFICE"] as const;
export const BRANCH_KIND_LABELS: Record<(typeof BRANCH_KINDS)[number], string> = {
  INSTITUTE: "Institute",
  SERVICE: "Service centre",
  BOTH: "Institute + service",
  HEAD_OFFICE: "Head office (cost centre)",
};

export const branchSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,4}$/, "2–4 letters/digits, e.g. KOC"),
  name: z.string().trim().min(2, "Enter the branch name").max(100),
  kind: z.enum(BRANCH_KINDS),
  gstRegistrationId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  stateCode: z.string().refine((v) => STATE_CODES.includes(v), "Select the state"),
  addressLine1: z.string().trim().min(3, "Enter the address").max(200),
  addressLine2: optional(200),
  city: z.string().trim().min(2, "Enter the city").max(80),
  pincode: z.string().trim().regex(PINCODE_REGEX, "Enter a valid 6-digit PIN code"),
  phone: indianPhone,
  email: z
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional()
    .transform((v) => v || null),
  mapUrl: z
    .url("Enter a full URL")
    .or(z.literal(""))
    .optional()
    .transform((v) => v || null),
  isActive: z.boolean(),
  showOnWebsite: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export type BranchInput = z.input<typeof branchSchema>;
export type BranchData = z.output<typeof branchSchema>;
