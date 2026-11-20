"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { DOCUMENT_TYPES, saveUpload } from "@/modules/files/files.service";
import { can } from "@/modules/rbac/access";
import { ActionError, defineAction, type ActionResult } from "@/modules/rbac/action";
import {
  accountsSettingsSchema,
  cancelEntrySchema,
  contraSchema,
  distributionRunSchema,
  expenseDecisionSchema,
  expenseSchema,
  incomeSchema,
  partnerSchema,
  partnerTxnSchema,
  payExpenseSchema,
  shareSetSchema,
} from "./accounts.schemas";
import {
  cancelExpense,
  cancelIncome,
  createContra,
  createExpense,
  createIncome,
  decideExpense,
  payExpense,
  saveAccountsSettings,
} from "./accounts.service";
import {
  addPartnerTxn,
  createDistributionRun,
  deleteDistributionRun,
  lockDistributionRun,
  savePartner,
  setShares,
} from "./partners.service";

const done = <T>(r: T) => {
  refresh();
  return r;
};
const id = z.object({ id: z.string().min(1) });

export const createExpenseAction = defineAction(
  { permission: "expenses.create", schema: expenseSchema },
  async (i, ctx) => done(await createExpense(ctx, i)),
);
export const decideExpenseAction = defineAction(
  { permission: "expenses.approve", schema: expenseDecisionSchema },
  async (i, ctx) => done(await decideExpense(ctx, i)),
);
export const payExpenseAction = defineAction({ permission: "expenses.pay", schema: payExpenseSchema }, async (i, ctx) =>
  done(await payExpense(ctx, i)),
);
export const cancelExpenseAction = defineAction(
  { permission: "expenses.create", schema: cancelEntrySchema },
  async (i, ctx) => done(await cancelExpense(ctx, i)),
);

export const createIncomeAction = defineAction({ permission: "income.create", schema: incomeSchema }, async (i, ctx) =>
  done(await createIncome(ctx, i)),
);
export const cancelIncomeAction = defineAction(
  { permission: "income.create", schema: cancelEntrySchema },
  async (i, ctx) => done(await cancelIncome(ctx, i)),
);

export const contraAction = defineAction({ permission: "accounts.contra", schema: contraSchema }, async (i, ctx) =>
  done(await createContra(ctx, i)),
);

export const saveAccountsSettingsAction = defineAction(
  { permission: "settings.update", schema: accountsSettingsSchema },
  async (i, ctx) => done(await saveAccountsSettings(ctx, i)),
);

export const savePartnerAction = defineAction(
  { permission: "partners.manage", schema: partnerSchema },
  async (i, ctx) => {
    const pid = await savePartner(ctx, i);
    if (!i.id) redirect(`/admin/accounts/partners/${pid}`);
    return done(pid);
  },
);
export const setSharesAction = defineAction({ permission: "partners.manage", schema: shareSetSchema }, async (i, ctx) =>
  done(await setShares(ctx, i)),
);
export const partnerTxnAction = defineAction(
  { permission: "partners.manage", schema: partnerTxnSchema },
  async (i, ctx) => done(await addPartnerTxn(ctx, i)),
);

export const createRunAction = defineAction(
  { permission: "profit.run", schema: distributionRunSchema },
  async (i, ctx) => {
    const runId = await createDistributionRun(ctx, i);
    redirect(`/admin/accounts/profit-distribution/${runId}`);
  },
);
export const lockRunAction = defineAction({ permission: "profit.lock", schema: id }, async (i, ctx) =>
  done(await lockDistributionRun(ctx, i.id)),
);
export const deleteRunAction = defineAction({ permission: "profit.run", schema: id }, async (i, ctx) => {
  await deleteDistributionRun(ctx, i.id);
  redirect("/admin/accounts/profit-distribution");
});

/** Upload a bill (image or PDF, private). Returns the file id; saving the expense attaches it. */
export async function uploadBillAction(formData: FormData): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    if (!can(user.access, "expenses.create")) return { ok: false, error: "You don't have permission to do this." };
    const file = z.instanceof(File).safeParse(formData.get("file"));
    if (!file.success || file.data.size === 0) return { ok: false, error: "Choose a file to upload." };
    const asset = await saveUpload(
      { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) },
      file.data,
      { allowed: DOCUMENT_TYPES, maxBytes: 8 * 1024 * 1024, isPublic: false, folder: "bills" },
    );
    return { ok: true, data: { id: asset.id, name: asset.originalName } };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[uploadBill]", e);
    return { ok: false, error: "Upload failed. Please try again." };
  }
}
