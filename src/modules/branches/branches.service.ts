import "server-only";
import { db, type Tx } from "@/lib/db";
import { financialYear } from "@/lib/fy";
import { writeAudit } from "@/modules/audit/audit.service";
import { DEFAULT_FORMATS, GST_DOC_TYPES, checkFormat } from "@/modules/numbering/format";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { canAccessBranch } from "@/modules/rbac/access";
import type { DocType } from "@/generated/prisma/enums";
import type { BranchData } from "./branches.schemas";

async function assertGstRegistration(tx: Tx, orgId: string, id: string | null, stateCode: string) {
  if (!id) return;
  const reg = await tx.gstRegistration.findFirst({ where: { id, organizationId: orgId } });
  if (!reg) throw new ActionError("Selected GST registration was not found.");
  if (reg.stateCode !== stateCode) {
    throw new ActionError(
      `The GSTIN ${reg.gstin} is registered in another state. Pick a GSTIN from the branch's state.`,
    );
  }
}

/** Create the current financial year's number series for every document type. */
export async function ensureNumberSeries(tx: Tx, branch: { id: string; organizationId: string }, date = new Date()) {
  const fy = financialYear(date);
  for (const [docType, def] of Object.entries(DEFAULT_FORMATS) as [DocType, { format: string; padding: number }][]) {
    await tx.numberSeries.upsert({
      where: { branchId_docType_financialYear: { branchId: branch.id, docType, financialYear: fy } },
      create: {
        organizationId: branch.organizationId,
        branchId: branch.id,
        docType,
        financialYear: fy,
        format: def.format,
        padding: def.padding,
      },
      update: {},
    });
  }
}

export async function saveBranch(ctx: ActionContext, input: BranchData) {
  const orgId = ctx.user.organizationId;
  const { id, ...data } = input;

  return db.$transaction(async (tx) => {
    await assertGstRegistration(tx, orgId, data.gstRegistrationId, data.stateCode);

    if (!id) {
      const branch = await tx.branch.create({ data: { ...data, organizationId: orgId } });
      await ensureNumberSeries(tx, branch);
      // The creator should be able to work in the new branch straight away.
      await tx.userBranch.upsert({
        where: { userId_branchId: { userId: ctx.user.id, branchId: branch.id } },
        create: { userId: ctx.user.id, branchId: branch.id },
        update: {},
      });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "Branch",
        entityId: branch.id,
        branchId: branch.id,
        after: branch,
      });
      return branch.id;
    }

    const before = await tx.branch.findFirst({ where: { id, organizationId: orgId } });
    if (!before) throw new ActionError("Branch not found.");
    if (!canAccessBranch(ctx.user.access, "branches.update", id)) throw new ActionError("You can't edit this branch.");
    if (before.code !== data.code) {
      // A longer code could push GST invoice numbers past 16 characters.
      const series = await tx.numberSeries.findMany({ where: { branchId: id, docType: { in: [...GST_DOC_TYPES] } } });
      for (const s of series) {
        const check = checkFormat({ format: s.format, docType: s.docType, branchCode: data.code, padding: s.padding });
        if (!check.ok)
          throw new ActionError(`With code ${data.code}: ${check.error} Shorten the code or the number format first.`);
      }
    }
    const after = await tx.branch.update({ where: { id }, data });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Branch",
      entityId: id,
      branchId: id,
      before,
      after,
    });
    return id;
  });
}

export async function setBranchDeleted(ctx: ActionContext, id: string, deleted: boolean) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const before = await tx.branch.findFirst({ where: { id, organizationId: orgId } });
    if (!before) throw new ActionError("Branch not found.");
    if (!canAccessBranch(ctx.user.access, "branches.delete", id))
      throw new ActionError("You can't change this branch.");
    if (deleted) {
      const remaining = await tx.branch.count({ where: { organizationId: orgId, deletedAt: null, id: { not: id } } });
      if (remaining === 0) throw new ActionError("You can't delete the last branch.");
    }
    const after = await tx.branch.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    await writeAudit(tx, ctx.actor, {
      action: deleted ? "DELETE" : "RESTORE",
      entityType: "Branch",
      entityId: id,
      branchId: id,
      before,
      after,
    });
  });
}
