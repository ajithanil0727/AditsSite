"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { changeOwnPasswordSchema, resetPasswordSchema, userSchema } from "./users.schemas";
import { changeOwnPassword, resetUserPassword, saveUser, setUserDeleted } from "./users.service";

export const saveUserAction = defineAction(
  { permission: (i) => (i.id ? "users.update" : "users.create"), schema: userSchema },
  async (input, ctx) => {
    const id = await saveUser(ctx, input);
    refresh();
    return { id };
  },
);

export const resetPasswordAction = defineAction(
  { permission: "users.reset_password", schema: resetPasswordSchema },
  async ({ id, password }, ctx) => resetUserPassword(ctx, id, password),
);

const idSchema = z.object({ id: z.string().min(1) });

export const deleteUserAction = defineAction({ permission: "users.delete", schema: idSchema }, async ({ id }, ctx) => {
  await setUserDeleted(ctx, id, true);
  refresh();
});

export const restoreUserAction = defineAction({ permission: "users.delete", schema: idSchema }, async ({ id }, ctx) => {
  await setUserDeleted(ctx, id, false);
  refresh();
});

/** Any signed-in user: change your own password (needs the current one). */
export const changeOwnPasswordAction = defineAction(
  { permission: null, schema: changeOwnPasswordSchema },
  async (input, ctx) => {
    const session = await auth.api.getSession({ headers: await headers() });
    await changeOwnPassword(ctx, input, session?.session.id ?? null);
  },
);
