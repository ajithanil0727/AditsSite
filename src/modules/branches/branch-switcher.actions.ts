"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACTIVE_BRANCH_COOKIE, getSelectableBranches } from "@/modules/auth/current";
import { ActionError, defineAction } from "@/modules/rbac/action";

/** Set the branch picked in the top bar ("all" = all branches the user may see). */
export const setActiveBranch = defineAction(
  { permission: null, schema: z.object({ branchId: z.string().min(1) }) },
  async ({ branchId }, { user }) => {
    if (branchId !== "all") {
      const branches = await getSelectableBranches(user);
      if (!branches.some((b) => b.id === branchId)) throw new ActionError("You can't access that branch.");
    }
    (await cookies()).set(ACTIVE_BRANCH_COOKIE, branchId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    refresh();
  },
);
