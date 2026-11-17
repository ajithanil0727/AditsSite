import "server-only";
import { db } from "@/lib/db";
import { financialYear } from "@/lib/fy";
import { writeAudit } from "@/modules/audit/audit.service";
import { ensureNumberSeries } from "@/modules/branches/branches.service";
import { checkFormat } from "@/modules/numbering/format";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import type { CurrentUser } from "@/modules/auth/current";
import type { numberSeriesSchema } from "./settings.schemas";
import type { z } from "zod";

export async function listNumberSeries(user: CurrentUser, branchId: string) {
  if (!canAccessBranch(user.access, "settings.view", branchId)) return [];
  const branch = await db.branch.findFirst({
    where: { id: branchId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, code: true, organizationId: true },
  });
  if (!branch) return [];
  const fy = financialYear(new Date());
  // Make sure this year's rows exist (first visit after 1 April creates them).
  await db.$transaction((tx) => ensureNumberSeries(tx, branch));
  const rows = await db.numberSeries.findMany({
    where: { branchId, financialYear: { in: [fy, "ALL"] } },
    orderBy: { docType: "asc" },
  });
  return rows.map((r) => ({ ...r, branchCode: branch.code }));
}

export async function updateNumberSeries(ctx: ActionContext, input: z.output<typeof numberSeriesSchema>) {
  await db.$transaction(async (tx) => {
    const before = await tx.numberSeries.findFirst({
      where: { id: input.id, organizationId: ctx.user.organizationId },
      include: { branch: { select: { code: true } } },
    });
    if (!before) throw new ActionError("Number series not found.");
    if (!canAccessBranch(ctx.user.access, "settings.update", before.branchId)) {
      throw new ActionError("You can't change settings for this branch.");
    }
    // Going backwards would re-issue numbers that are already used.
    if (input.nextNumber < before.nextNumber) {
      throw new ActionError(
        `The next number can't go below ${before.nextNumber}; earlier numbers may already be used.`,
      );
    }
    const check = checkFormat({
      format: input.format,
      docType: before.docType,
      branchCode: before.branch.code,
      padding: input.padding,
    });
    if (!check.ok) throw new ActionError(check.error);

    const after = await tx.numberSeries.update({
      where: { id: before.id },
      data: {
        format: input.format,
        padding: input.padding,
        nextNumber: input.nextNumber,
        resetPolicy: input.resetPolicy,
      },
    });
    const { branch: _branch, ...beforeRow } = before;
    void _branch;
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "NumberSeries",
      entityId: before.id,
      branchId: before.branchId,
      before: beforeRow,
      after,
    });
  });
}
