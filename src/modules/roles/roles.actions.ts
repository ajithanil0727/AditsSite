"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import { createRoleSchema, updateRoleSchema } from "./roles.schemas";
import { createRole, deleteRole, updateRole } from "./roles.service";

export const createRoleAction = defineAction(
  { permission: "roles.manage", schema: createRoleSchema },
  async (input, ctx) => {
    const id = await createRole(ctx, input);
    redirect(`/admin/settings/roles/${id}`);
  },
);

export const updateRoleAction = defineAction(
  { permission: "roles.manage", schema: updateRoleSchema },
  async (input, ctx) => {
    await updateRole(ctx, input);
    refresh();
  },
);

export const deleteRoleAction = defineAction(
  { permission: "roles.manage", schema: z.object({ id: z.string().min(1) }) },
  async ({ id }, ctx) => {
    await deleteRole(ctx, id);
    redirect("/admin/settings/roles");
  },
);
