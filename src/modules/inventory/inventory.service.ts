import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { assertMoneyAccount, assertPaymentMode, recordMoney } from "@/modules/accounts/money.service";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { landedUnitCost } from "./costing";
import type {
  adjustSchema,
  partSchema,
  purchaseSchema,
  transferSchema,
  vendorPaymentSchema,
} from "./inventory.schemas";
import { issueStock, receiveStock } from "./stock.service";

const parseDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// ---------------------------------------------------------------- parts

export async function savePart(ctx: ActionContext, input: z.output<typeof partSchema>) {
  const orgId = ctx.user.organizationId;
  const { id, ...data } = input;
  return db.$transaction(async (tx) => {
    if (!id) {
      const part = await tx.part.create({ data: { ...data, organizationId: orgId } });
      await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Part", entityId: part.id, after: part });
      return part.id;
    }
    const before = await tx.part.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!before) throw new ActionError("Part not found.");
    const after = await tx.part.update({ where: { id }, data });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Part", entityId: id, before, after });
    return id;
  });
}

// ---------------------------------------------------------------- adjustments

export async function adjustStock(ctx: ActionContext, input: z.output<typeof adjustSchema>) {
  if (!canAccessBranch(ctx.user.access, "inventory.adjust", input.branchId)) {
    throw new ActionError("You can't adjust stock in this branch.");
  }
  await db.$transaction(async (tx) => {
    const part = await tx.part.findFirst({ where: { id: input.partId, organizationId: ctx.user.organizationId } });
    if (!part) throw new ActionError("Part not found.");
    const base = {
      organizationId: ctx.user.organizationId,
      branchId: input.branchId,
      partId: input.partId,
      note: input.note,
      userId: ctx.user.id,
      refType: "Adjustment",
    };
    let movement;
    if (input.type === "ADJUSTMENT_IN") {
      const current = await tx.stock.findUnique({
        where: { branchId_partId: { branchId: input.branchId, partId: input.partId } },
      });
      const unitCost = input.unitCost ?? Number(current?.avgCost ?? 0);
      movement = await receiveStock(tx, { ...base, qty: input.qty, unitCost, type: "ADJUSTMENT_IN" });
    } else {
      movement = (await issueStock(tx, { ...base, qty: input.qty, type: input.type })).movement;
    }
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "StockMovement",
      entityId: movement.id,
      branchId: input.branchId,
      after: movement,
    });
  });
}

// ---------------------------------------------------------------- transfers

export async function createTransfer(ctx: ActionContext, input: z.output<typeof transferSchema>) {
  if (!canAccessBranch(ctx.user.access, "inventory.transfer", input.fromBranchId)) {
    throw new ActionError("You can only send stock from your own branches.");
  }
  return db.$transaction(async (tx) => {
    const to = await tx.branch.findFirst({
      where: { id: input.toBranchId, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!to) throw new ActionError("Receiving branch not found.");
    const transferNo = await nextDocNumber(tx, { branchId: input.fromBranchId, docType: "STOCK_TRANSFER" });
    const transfer = await tx.stockTransfer.create({
      data: {
        organizationId: ctx.user.organizationId,
        transferNo,
        fromBranchId: input.fromBranchId,
        toBranchId: input.toBranchId,
        note: input.note,
        items: { create: input.items.map((i) => ({ partId: i.partId, qty: i.qty, unitCost: 0 })) },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "StockTransfer",
      entityId: transfer.id,
      branchId: input.fromBranchId,
      after: transfer,
    });
    return transfer.id;
  });
}

/** Sending branch dispatches: stock leaves at its average cost (carried to the receiver). */
export async function dispatchTransfer(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const t = await tx.stockTransfer.findFirst({
      where: { id, organizationId: ctx.user.organizationId },
      include: { items: true },
    });
    if (!t) throw new ActionError("Transfer not found.");
    if (t.status !== "DRAFT") throw new ActionError("Only a draft transfer can be dispatched.");
    if (!canAccessBranch(ctx.user.access, "inventory.transfer", t.fromBranchId)) {
      throw new ActionError("You can't dispatch from this branch.");
    }
    for (const item of t.items) {
      const { unitCost } = await issueStock(tx, {
        organizationId: t.organizationId,
        branchId: t.fromBranchId,
        partId: item.partId,
        qty: Number(item.qty),
        type: "TRANSFER_OUT",
        refType: "StockTransfer",
        refId: t.id,
        userId: ctx.user.id,
      });
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { unitCost } });
    }
    await tx.stockTransfer.update({
      where: { id },
      data: { status: "DISPATCHED", dispatchedById: ctx.user.id, dispatchedAt: new Date() },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "StockTransfer",
      entityId: id,
      branchId: t.fromBranchId,
      before: { status: t.status },
      after: { status: "DISPATCHED" },
    });
  });
}

export async function receiveTransfer(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const t = await tx.stockTransfer.findFirst({
      where: { id, organizationId: ctx.user.organizationId },
      include: { items: true },
    });
    if (!t) throw new ActionError("Transfer not found.");
    if (t.status !== "DISPATCHED") throw new ActionError("Only a dispatched transfer can be received.");
    if (!canAccessBranch(ctx.user.access, "inventory.receive_transfer", t.toBranchId)) {
      throw new ActionError("Only the receiving branch can receive this transfer.");
    }
    for (const item of t.items) {
      await receiveStock(tx, {
        organizationId: t.organizationId,
        branchId: t.toBranchId,
        partId: item.partId,
        qty: Number(item.qty),
        unitCost: Number(item.unitCost),
        type: "TRANSFER_IN",
        refType: "StockTransfer",
        refId: t.id,
        userId: ctx.user.id,
      });
    }
    await tx.stockTransfer.update({
      where: { id },
      data: { status: "RECEIVED", receivedById: ctx.user.id, receivedAt: new Date() },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "StockTransfer",
      entityId: id,
      branchId: t.toBranchId,
      before: { status: t.status },
      after: { status: "RECEIVED" },
    });
  });
}

export async function cancelTransfer(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const t = await tx.stockTransfer.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
    if (!t) throw new ActionError("Transfer not found.");
    if (t.status !== "DRAFT") throw new ActionError("Only a draft (not yet dispatched) transfer can be cancelled.");
    if (!canAccessBranch(ctx.user.access, "inventory.transfer", t.fromBranchId))
      throw new ActionError("Not your branch.");
    await tx.stockTransfer.update({ where: { id }, data: { status: "CANCELLED" } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "StockTransfer",
      entityId: id,
      branchId: t.fromBranchId,
      before: { status: t.status },
      after: { status: "CANCELLED" },
    });
  });
}

// ---------------------------------------------------------------- purchases

function purchaseTotals<T extends { qty: number; unitCost: number; taxRate: number }>(items: T[]) {
  const lines = items.map((i) => {
    const net = Math.round(i.qty * i.unitCost * 100);
    const tax = Math.round((net * i.taxRate) / 100);
    return { ...i, taxAmount: tax / 100, total: (net + tax) / 100, net: net / 100 };
  });
  const subtotal = lines.reduce((a, l) => a + l.net, 0);
  const taxTotal = lines.reduce((a, l) => a + l.taxAmount, 0);
  return { lines, subtotal: round2(subtotal), taxTotal: round2(taxTotal), total: round2(subtotal + taxTotal) };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function savePurchaseDraft(ctx: ActionContext, input: z.output<typeof purchaseSchema>) {
  if (!canAccessBranch(ctx.user.access, "purchases.create", input.branchId)) {
    throw new ActionError("You can't record purchases for this branch.");
  }
  const t = purchaseTotals(input.items);
  return db.$transaction(async (tx) => {
    const vendor = await tx.vendor.findFirst({
      where: { id: input.vendorId, organizationId: ctx.user.organizationId },
    });
    if (!vendor) throw new ActionError("Vendor not found.");
    const data = {
      branchId: input.branchId,
      vendorId: input.vendorId,
      billNo: input.billNo,
      billDate: parseDate(input.billDate),
      notes: input.notes,
      subtotal: t.subtotal,
      taxTotal: t.taxTotal,
      total: t.total,
    };
    const items = t.lines.map((l) => ({
      partId: l.partId,
      qty: l.qty,
      unitCost: l.unitCost,
      taxRate: l.taxRate,
      taxAmount: l.taxAmount,
      total: l.total,
    }));
    if (input.id) {
      const before = await tx.purchase.findFirst({ where: { id: input.id, organizationId: ctx.user.organizationId } });
      if (!before) throw new ActionError("Purchase not found.");
      if (before.status !== "DRAFT") throw new ActionError("Posted purchases can't be edited.");
      await tx.purchaseItem.deleteMany({ where: { purchaseId: input.id } });
      const after = await tx.purchase.update({ where: { id: input.id }, data: { ...data, items: { create: items } } });
      await writeAudit(tx, ctx.actor, {
        action: "UPDATE",
        entityType: "Purchase",
        entityId: input.id,
        branchId: input.branchId,
        before,
        after,
      });
      return input.id;
    }
    const purchaseNo = await nextDocNumber(tx, { branchId: input.branchId, docType: "PURCHASE" });
    const purchase = await tx.purchase.create({
      data: {
        ...data,
        organizationId: ctx.user.organizationId,
        purchaseNo,
        createdById: ctx.user.id,
        items: { create: items },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Purchase",
      entityId: purchase.id,
      branchId: input.branchId,
      after: purchase,
    });
    return purchase.id;
  });
}

/** Post: stock comes in at landed cost (GST added for unregistered branches, which can't claim it back). */
export async function postPurchase(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const p = await tx.purchase.findFirst({
      where: { id, organizationId: ctx.user.organizationId },
      include: { items: true, branch: { select: { gstRegistrationId: true } } },
    });
    if (!p) throw new ActionError("Purchase not found.");
    if (p.status !== "DRAFT") throw new ActionError("This purchase is already posted or cancelled.");
    if (!canAccessBranch(ctx.user.access, "purchases.post", p.branchId)) throw new ActionError("Not your branch.");
    const registered = !!p.branch.gstRegistrationId;
    for (const item of p.items) {
      await receiveStock(tx, {
        organizationId: p.organizationId,
        branchId: p.branchId,
        partId: item.partId,
        qty: Number(item.qty),
        unitCost: landedUnitCost({
          unitCost: Number(item.unitCost),
          taxRate: Number(item.taxRate),
          branchRegistered: registered,
        }),
        type: "PURCHASE",
        refType: "Purchase",
        refId: p.id,
        userId: ctx.user.id,
      });
    }
    await tx.purchase.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Purchase",
      entityId: id,
      branchId: p.branchId,
      before: { status: "DRAFT" },
      after: { status: "POSTED" },
    });
  });
}

export async function cancelPurchase(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const p = await tx.purchase.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
    if (!p) throw new ActionError("Purchase not found.");
    if (p.status !== "DRAFT")
      throw new ActionError("Only drafts can be cancelled. Posted stock is corrected with a stock adjustment.");
    if (!canAccessBranch(ctx.user.access, "purchases.cancel", p.branchId)) throw new ActionError("Not your branch.");
    await tx.purchase.update({ where: { id }, data: { status: "CANCELLED" } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Purchase",
      entityId: id,
      branchId: p.branchId,
      before: { status: p.status },
      after: { status: "CANCELLED" },
    });
  });
}

export async function payVendor(ctx: ActionContext, input: z.output<typeof vendorPaymentSchema>) {
  await db.$transaction(async (tx) => {
    const p = await tx.purchase.findFirst({ where: { id: input.purchaseId, organizationId: ctx.user.organizationId } });
    if (!p) throw new ActionError("Purchase not found.");
    if (p.status !== "POSTED") throw new ActionError("Post the purchase before paying it.");
    if (!canAccessBranch(ctx.user.access, "vendors.pay", p.branchId)) throw new ActionError("Not your branch.");
    const due = round2(Number(p.total) - Number(p.amountPaid));
    if (input.amount > due + 0.001) throw new ActionError(`Only ₹${due.toFixed(2)} is due on this bill.`);
    await assertPaymentMode(tx, ctx.user.organizationId, input.paymentModeId, input.reference);
    await assertMoneyAccount(tx, input.moneyAccountId, p.branchId);
    const paidAt = parseDate(input.paidAt);
    const pay = await tx.vendorPayment.create({
      data: {
        organizationId: ctx.user.organizationId,
        branchId: p.branchId,
        vendorId: p.vendorId,
        purchaseId: p.id,
        paidAt,
        amount: input.amount,
        paymentModeId: input.paymentModeId,
        moneyAccountId: input.moneyAccountId,
        reference: input.reference,
        paidById: ctx.user.id,
      },
    });
    await tx.purchase.update({ where: { id: p.id }, data: { amountPaid: { increment: input.amount } } });
    await recordMoney(tx, {
      organizationId: ctx.user.organizationId,
      branchId: p.branchId,
      moneyAccountId: input.moneyAccountId,
      date: paidAt,
      direction: "OUT",
      amount: input.amount,
      source: "VENDOR_PAYMENT",
      refType: "VendorPayment",
      refId: pay.id,
      narration: `Paid against ${p.purchaseNo} (bill ${p.billNo})`,
      createdById: ctx.user.id,
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "VendorPayment",
      entityId: pay.id,
      branchId: p.branchId,
      after: pay,
    });
  });
}
