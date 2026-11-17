import { z } from "zod";
import { isPermissionKey } from "@/lib/permissions";

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name").max(60),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  copyFromRoleId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
});
export type CreateRoleInput = z.input<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Enter a role name").max(60),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  discountLimitPercent: z.coerce.number().min(0).max(100),
  discountLimitAmount: z.coerce.number().min(0).max(100_000_000),
  permissions: z.array(z.string().refine(isPermissionKey, "Unknown permission")),
});
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;
