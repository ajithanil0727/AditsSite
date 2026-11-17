import "server-only";
import { db } from "@/lib/db";
import { stateName } from "@/lib/india-states";
import { writeAudit } from "@/modules/audit/audit.service";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import type { gstRegistrationSchema } from "./settings.schemas";
import type { z } from "zod";

type GstData = z.output<typeof gstRegistrationSchema>;

export async function listGstRegistrations(organizationId: string) {
  return db.gstRegistration.findMany({
    where: { organizationId },
    include: { branches: { where: { deletedAt: null }, select: { code: true, name: true } } },
    orderBy: { gstin: "asc" },
  });
}

export async function saveGstRegistration(ctx: ActionContext, input: GstData) {
  const orgId = ctx.user.organizationId;
  const stateCode = input.gstin.slice(0, 2);
  if (!stateName(stateCode) || stateName(stateCode) === stateCode) {
    throw new ActionError("The first two digits of the GSTIN are not a valid state code.");
  }
  const data = {
    gstin: input.gstin,
    legalName: input.legalName,
    tradeName: input.tradeName ?? null,
    stateCode,
    stateName: input.stateName || stateName(stateCode),
    address: input.address,
    isActive: input.isActive,
  };

  await db.$transaction(async (tx) => {
    if (!input.id) {
      const created = await tx.gstRegistration.create({ data: { ...data, organizationId: orgId } });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "GstRegistration",
        entityId: created.id,
        after: created,
      });
      return;
    }
    const before = await tx.gstRegistration.findFirst({ where: { id: input.id, organizationId: orgId } });
    if (!before) throw new ActionError("GST registration not found.");
    if (before.gstin !== data.gstin) {
      const issued = await tx.invoice.count({ where: { gstRegistrationId: before.id } });
      if (issued > 0)
        throw new ActionError(
          "This GSTIN is already on issued invoices, so it can't be changed. Add a new registration instead.",
        );
    }
    if (before.stateCode !== stateCode) {
      const linked = await tx.branch.count({ where: { gstRegistrationId: before.id, deletedAt: null } });
      if (linked > 0) throw new ActionError("Branches use this registration; the state can't change.");
    }
    const after = await tx.gstRegistration.update({ where: { id: before.id }, data });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "GstRegistration",
      entityId: before.id,
      before,
      after,
    });
  });
}
