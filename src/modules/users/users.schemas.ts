import { z } from "zod";
import { indianPhone } from "@/lib/format";

export const ROLE_SCOPES = ["OWN", "ASSIGNED_BRANCHES", "ALL_BRANCHES"] as const;
export const SCOPE_LABELS: Record<(typeof ROLE_SCOPES)[number], string> = {
  OWN: "Own records",
  ASSIGNED_BRANCHES: "Assigned branches",
  ALL_BRANCHES: "All branches",
};

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");

export const userSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Enter the name").max(100),
    email: z.email("Enter a valid email").trim().toLowerCase(),
    phone: indianPhone
      .or(z.literal(""))
      .optional()
      .transform((v) => v || null),
    password: z.string().optional(),
    isActive: z.boolean(),
    roles: z
      .array(z.object({ roleId: z.string().min(1), scope: z.enum(ROLE_SCOPES) }))
      .min(1, "Give the user at least one role"),
    branchIds: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (!v.id || v.password) {
      const r = passwordSchema.safeParse(v.password ?? "");
      if (!r.success) ctx.addIssue({ code: "custom", path: ["password"], message: r.error.issues[0].message });
    }
    const needsBranch = v.roles.some((r) => r.scope !== "ALL_BRANCHES");
    if (needsBranch && v.branchIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Assign at least one branch" });
    }
    if (new Set(v.roles.map((r) => r.roleId)).size !== v.roles.length) {
      ctx.addIssue({ code: "custom", path: ["roles"], message: "Each role can be added once" });
    }
  });

export type UserInput = z.input<typeof userSchema>;
export type UserData = z.output<typeof userSchema>;

export const resetPasswordSchema = z.object({ id: z.string().min(1), password: passwordSchema });
