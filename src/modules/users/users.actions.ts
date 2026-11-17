"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import { resetPasswordSchema, userSchema } from "./users.schemas";
import { resetUserPassword, saveUser, setUserDeleted } from "./users.service";

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
