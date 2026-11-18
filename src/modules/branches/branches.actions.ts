"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { revalidateSite } from "@/modules/website/site.data";
import { defineAction } from "@/modules/rbac/action";
import { branchSchema } from "./branches.schemas";
import { saveBranch, setBranchDeleted } from "./branches.service";

export const saveBranchAction = defineAction(
  { permission: (i) => (i.id ? "branches.update" : "branches.create"), schema: branchSchema },
  async (input, ctx) => {
    const id = await saveBranch(ctx, input);
    revalidateSite();
    refresh();
    return { id };
  },
);

const idSchema = z.object({ id: z.string().min(1) });

export const deleteBranchAction = defineAction(
  { permission: "branches.delete", schema: idSchema },
  async ({ id }, ctx) => {
    await setBranchDeleted(ctx, id, true);
    revalidateSite();
    refresh();
  },
);

export const restoreBranchAction = defineAction(
  { permission: "branches.delete", schema: idSchema },
  async ({ id }, ctx) => {
    await setBranchDeleted(ctx, id, false);
    revalidateSite();
    refresh();
  },
);
