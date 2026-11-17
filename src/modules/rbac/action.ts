import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { PermissionKey } from "@/lib/permissions";
import type { AuditActor } from "@/modules/audit/audit.service";
import { getActiveBranchId, getCurrentUser, getRequestMeta, type CurrentUser } from "@/modules/auth/current";
import { can } from "./access";

export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/** Throw inside a service/handler to return a friendly message to the user. */
export class ActionError extends Error {}

export type ActionContext = {
  user: CurrentUser;
  activeBranchId: string | null;
  actor: AuditActor;
};

type Options<S extends z.ZodType> = {
  /**
   * Required permission. Use null only for actions every signed-in user may run.
   * A function is resolved after validation, e.g. create vs update: (i) => i.id ? "x.update" : "x.create".
   */
  permission: PermissionKey | null | ((input: z.infer<S>) => PermissionKey);
  schema: S;
};

/**
 * Wrap a server action: session -> permission -> Zod validation -> handler -> friendly errors.
 * Branch-scope checks happen inside the handler/service (they depend on the record).
 */
export function defineAction<S extends z.ZodType, R>(
  options: Options<S>,
  handler: (input: z.infer<S>, ctx: ActionContext) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const user = await getCurrentUser();
      if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
      const denied = { ok: false as const, error: "You don't have permission to do this." };
      if (typeof options.permission === "string" && !can(user.access, options.permission)) return denied;

      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Please correct the highlighted fields.",
          fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
        };
      }
      if (typeof options.permission === "function" && !can(user.access, options.permission(parsed.data))) {
        return denied;
      }

      const meta = await getRequestMeta();
      const ctx: ActionContext = {
        user,
        activeBranchId: await getActiveBranchId(user),
        actor: { organizationId: user.organizationId, userId: user.id, ...meta },
      };
      return { ok: true, data: await handler(parsed.data, ctx) };
    } catch (error) {
      unstable_rethrow(error); // let redirect()/notFound() through
      if (error instanceof ActionError) return { ok: false, error: error.message };
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "A record with the same value already exists." };
      }
      console.error("[action]", error);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
