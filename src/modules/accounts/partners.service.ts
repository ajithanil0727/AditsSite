import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { paiseToDecimalString } from "@/modules/tax/gst";
import type { distributionRunSchema, partnerSchema, partnerTxnSchema, shareSetSchema } from "./accounts.schemas";
import { assertMoneyAccount, recordMoney } from "./money.service";
import { computePnl, EMPTY_FIGURES, shareSegments, splitProfit, validateShareSet } from "./pnl-logic";
import { branchFigures, dateOnly } from "./pnl.queries";

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------------ partners

export async function savePartner(ctx: ActionContext, input: z.output<typeof partnerSchema>) {
  const orgId = ctx.user.organizationId;
  return db.$transaction(async (tx) => {
    if (input.userId) {
      const u = await tx.user.findFirst({ where: { id: input.userId, organizationId: orgId, deletedAt: null } });
      if (!u) throw new ActionError("User not found.");
      const taken = await tx.partner.findFirst({
        where: { userId: input.userId, ...(input.id ? { id: { not: input.id } } : {}) },
      });
      if (taken) throw new ActionError("That login is already linked to another partner.");
    }
    const data = {
      name: input.name,
      phone: input.phone,
      email: input.email,
      pan: input.pan,
      userId: input.userId,
      isActive: input.isActive,
    };
    if (!input.id) {
      const p = await tx.partner.create({ data: { ...data, organizationId: orgId } });
      await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Partner", entityId: p.id, after: p });
      return p.id;
    }
    const before = await tx.partner.findFirst({ where: { id: input.id, organizationId: orgId, deletedAt: null } });
    if (!before) throw new ActionError("Partner not found.");
    const after = await tx.partner.update({ where: { id: input.id }, data });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Partner", entityId: input.id, before, after });
    return input.id;
  });
}

/**
 * Set a branch's shares from a date. The previous set (if any) ends the day before.
 * An empty list means "no shares from this date" (shares are optional).
 * Later sets for the same branch must be entered after earlier ones (no rewriting history).
 */
export async function setShares(ctx: ActionContext, input: z.output<typeof shareSetSchema>) {
  const orgId = ctx.user.organizationId;
  const problem = validateShareSet(input.shares);
  if (problem) throw new ActionError(problem);
  if (new Set(input.shares.map((s) => s.partnerId)).size !== input.shares.length)
    throw new ActionError("A partner is listed twice.");
  const from = dateOnly(input.effectiveFrom);
  await db.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } });
    if (!branch) throw new ActionError("Branch not found.");
    const partners = await tx.partner.findMany({
      where: { id: { in: input.shares.map((s) => s.partnerId) }, organizationId: orgId, deletedAt: null },
    });
    if (partners.length !== input.shares.length) throw new ActionError("One of the partners was not found.");
    const later = await tx.partnerShare.findFirst({ where: { branchId: branch.id, effectiveFrom: { gte: from } } });
    if (later)
      throw new ActionError(
        `${branch.name} already has shares from ${ymd(later.effectiveFrom)} or later. Pick a later date.`,
      );
    const locked = await tx.profitDistributionRun.findFirst({
      where: { organizationId: orgId, status: "LOCKED", periodTo: { gte: from } },
    });
    if (locked)
      throw new ActionError(
        `Profit up to ${ymd(locked.periodTo)} is already locked. New shares must start after that.`,
      );
    const before = await tx.partnerShare.findMany({ where: { branchId: branch.id, effectiveTo: null } });
    await tx.partnerShare.updateMany({
      where: { branchId: branch.id, effectiveTo: null },
      data: { effectiveTo: new Date(from.getTime() - DAY) },
    });
    if (input.shares.length) {
      await tx.partnerShare.createMany({
        data: input.shares.map((s) => ({
          partnerId: s.partnerId,
          branchId: branch.id,
          percent: s.percent,
          effectiveFrom: from,
          note: input.note,
        })),
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "PartnerShare",
      entityId: branch.id,
      branchId: branch.id,
      before: before.map((b) => ({ partnerId: b.partnerId, percent: Number(b.percent), from: ymd(b.effectiveFrom) })),
      after: { from: input.effectiveFrom, shares: input.shares },
    });
  });
}

export async function addPartnerTxn(ctx: ActionContext, input: z.output<typeof partnerTxnSchema>) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const partner = await tx.partner.findFirst({
      where: { id: input.partnerId, organizationId: orgId, deletedAt: null },
    });
    if (!partner) throw new ActionError("Partner not found.");
    if (!canAccessBranch(ctx.user.access, "partners.manage", input.branchId))
      throw new ActionError("Branch not allowed.");
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } });
    if (!branch) throw new ActionError("Branch not found.");
    if (input.moneyAccountId) await assertMoneyAccount(tx, input.moneyAccountId, branch.id);
    const row = await tx.partnerTransaction.create({
      data: {
        organizationId: orgId,
        partnerId: partner.id,
        branchId: branch.id,
        type: input.type,
        amount: input.amount,
        date: dateOnly(input.date),
        moneyAccountId: input.moneyAccountId,
        note: input.note,
        createdById: ctx.user.id,
      },
    });
    // Capital in brings money into an account; capital back and drawings take it out.
    if (input.moneyAccountId) {
      await recordMoney(tx, {
        organizationId: orgId,
        branchId: branch.id,
        moneyAccountId: input.moneyAccountId,
        date: row.date,
        direction: input.type === "CAPITAL_IN" ? "IN" : "OUT",
        amount: input.amount,
        source: input.type === "DRAWING" ? "PARTNER_DRAWING" : "PARTNER_CAPITAL",
        refType: "PartnerTransaction",
        refId: row.id,
        narration:
          `${partner.name} · ${input.type === "CAPITAL_IN" ? "capital in" : input.type === "CAPITAL_OUT" ? "capital back" : "drawing"}${input.note ? ` · ${input.note}` : ""}`.slice(
            0,
            300,
          ),
        createdById: ctx.user.id,
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "PartnerTransaction",
      entityId: row.id,
      branchId: branch.id,
      after: row,
    });
  });
}

// ------------------------------------------------------------------ profit distribution

export type RunSummaryBranch = {
  branchId: string;
  code: string;
  name: string;
  income: number;
  costs: number;
  net: number;
  distributed: number;
  undistributed: number;
};

/** Work out each partner's share of each branch's profit for a period and save it as a draft run. */
export async function createDistributionRun(ctx: ActionContext, input: z.output<typeof distributionRunSchema>) {
  const orgId = ctx.user.organizationId;
  const from = dateOnly(input.periodFrom);
  const to = dateOnly(input.periodTo);
  const branchList = await db.branch.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  const ids = branchList.map((b) => b.id);
  const shares = await db.partnerShare.findMany({
    where: {
      branchId: { in: ids },
      effectiveFrom: { lte: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      partner: { deletedAt: null },
    },
  });

  const { branches, figures } = await branchFigures(orgId, ids, input.periodFrom, input.periodTo);
  const lines: Prisma.ProfitDistributionLineCreateManyRunInput[] = [];
  const summary: RunSummaryBranch[] = [];

  for (const b of branches) {
    const whole = computePnl(figures.get(b.id) ?? EMPTY_FIGURES);
    const segments = shareSegments(
      shares
        .filter((s) => s.branchId === b.id)
        .map((s) => ({ partnerId: s.partnerId, percent: Number(s.percent), from: s.effectiveFrom, to: s.effectiveTo })),
      from,
      to,
    );
    let distributed = 0;
    let undistributed = 0;
    for (const seg of segments) {
      // One segment = the whole period: reuse the figures; otherwise compute that part's profit.
      const pnl =
        segments.length === 1
          ? whole
          : computePnl(
              (await branchFigures(orgId, [b.id], ymd(seg.from), ymd(seg.to))).figures.get(b.id) ?? EMPTY_FIGURES,
            );
      const split = splitProfit(pnl.net, seg.shares);
      undistributed += split.undistributed;
      for (const l of split.lines) {
        distributed += l.amount;
        lines.push({
          branchId: b.id,
          partnerId: l.partnerId,
          branchRevenue: paiseToDecimalString(pnl.income),
          branchCosts: paiseToDecimalString(pnl.costs),
          branchNetProfit: paiseToDecimalString(pnl.net),
          sharePercent: l.percent,
          amount: paiseToDecimalString(l.amount),
          segmentFrom: seg.from,
          segmentTo: seg.to,
        });
      }
    }
    summary.push({
      branchId: b.id,
      code: b.code,
      name: b.name,
      income: whole.income,
      costs: whole.costs,
      net: whole.net,
      distributed,
      undistributed: whole.net - distributed,
    });
    void undistributed;
  }

  return db.$transaction(async (tx) => {
    const run = await tx.profitDistributionRun.create({
      data: {
        organizationId: orgId,
        periodFrom: from,
        periodTo: to,
        note: input.note,
        summary: summary as unknown as Prisma.InputJsonValue,
        createdById: ctx.user.id,
        lines: { createMany: { data: lines } },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "ProfitDistributionRun",
      entityId: run.id,
      after: { periodFrom: input.periodFrom, periodTo: input.periodTo, lines: lines.length },
    });
    return run.id;
  });
}

export async function lockDistributionRun(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const run = await tx.profitDistributionRun.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
    if (!run) throw new ActionError("Run not found.");
    if (run.status === "LOCKED") throw new ActionError("Already locked.");
    const overlap = await tx.profitDistributionRun.findFirst({
      where: {
        organizationId: run.organizationId,
        status: "LOCKED",
        periodFrom: { lte: run.periodTo },
        periodTo: { gte: run.periodFrom },
      },
    });
    if (overlap) throw new ActionError("Another locked run already covers part of this period.");
    await tx.profitDistributionRun.update({
      where: { id },
      data: { status: "LOCKED", lockedById: ctx.user.id, lockedAt: new Date() },
    });
    await writeAudit(tx, ctx.actor, {
      action: "APPROVE",
      entityType: "ProfitDistributionRun",
      entityId: id,
      before: { status: run.status },
      after: { status: "LOCKED" },
    });
  });
}

export async function deleteDistributionRun(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const run = await tx.profitDistributionRun.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
    if (!run) throw new ActionError("Run not found.");
    if (run.status === "LOCKED") throw new ActionError("A locked run can't be deleted.");
    await tx.profitDistributionRun.delete({ where: { id } });
    await writeAudit(tx, ctx.actor, {
      action: "DELETE",
      entityType: "ProfitDistributionRun",
      entityId: id,
      before: run,
    });
  });
}
