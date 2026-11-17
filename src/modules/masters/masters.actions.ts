"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { can } from "@/modules/rbac/access";
import { ActionError, defineAction } from "@/modules/rbac/action";
import { MASTERS, MASTER_KINDS, masterSchema } from "./registry";
import { saveMaster } from "./masters.service";

/** One action for every simple master list; the kind decides the permission and the schema. */
export const saveMasterAction = defineAction(
  {
    permission: null, // checked below per kind
    schema: z.object({ kind: z.enum(MASTER_KINDS), values: z.record(z.string(), z.unknown()) }),
  },
  async ({ kind, values }, ctx) => {
    const def = MASTERS[kind];
    if (!can(ctx.user.access, def.permission)) throw new ActionError("You don't have permission to do this.");
    const parsed = masterSchema(def).safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ActionError(first ? first.message : "Please check the form.");
    }
    await saveMaster(ctx, def, parsed.data as Record<string, unknown>);
    refresh();
  },
);
