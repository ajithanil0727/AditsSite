import "server-only";
import type { StockMovementType } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db";
import { ActionError } from "@/modules/rbac/action";
import { averageAfterReceipt, roundQty } from "./costing";

type MoveBase = {
  organizationId: string;
  branchId: string;
  partId: string;
  refType?: string;
  refId?: string;
  note?: string | null;
  userId?: string | null;
};

/** Lock (and create if missing) the stock row so concurrent movements on the same part+branch queue up. */
async function lockStock(tx: Tx, branchId: string, partId: string) {
  await tx.stock.upsert({
    where: { branchId_partId: { branchId, partId } },
    create: { branchId, partId, qty: 0, avgCost: 0 },
    update: {},
  });
  await tx.$queryRaw`SELECT id FROM "Stock" WHERE "branchId" = ${branchId} AND "partId" = ${partId} FOR UPDATE`;
  return tx.stock.findUniqueOrThrow({ where: { branchId_partId: { branchId, partId } } });
}

/** Stock in: purchases, transfers in, returns from jobs, positive adjustments. Recomputes the average cost. */
export async function receiveStock(
  tx: Tx,
  m: MoveBase & {
    qty: number;
    unitCost: number;
    type: Extract<StockMovementType, "OPENING" | "PURCHASE" | "TRANSFER_IN" | "JOB_RETURN" | "ADJUSTMENT_IN">;
  },
) {
  if (!(m.qty > 0)) throw new ActionError("Quantity must be more than zero.");
  const stock = await lockStock(tx, m.branchId, m.partId);
  const oldQty = Number(stock.qty);
  const avg = averageAfterReceipt(oldQty, Number(stock.avgCost), m.qty, m.unitCost);
  const qty = roundQty(oldQty + m.qty);
  await tx.stock.update({ where: { id: stock.id }, data: { qty, avgCost: avg } });
  return tx.stockMovement.create({
    data: {
      organizationId: m.organizationId,
      branchId: m.branchId,
      partId: m.partId,
      type: m.type,
      qty: m.qty,
      unitCost: m.unitCost,
      balanceAfter: qty,
      avgCostAfter: avg,
      refType: m.refType,
      refId: m.refId,
      note: m.note,
      userId: m.userId,
    },
  });
}

/**
 * Stock out at the current average cost: job issues, transfers out, negative adjustments, internal use.
 * Never goes below zero (business rule): the store must enter the purchase/adjustment first.
 */
export async function issueStock(
  tx: Tx,
  m: MoveBase & {
    qty: number;
    type: Extract<
      StockMovementType,
      "JOB_ISSUE" | "TRANSFER_OUT" | "ADJUSTMENT_OUT" | "INTERNAL_USE" | "PURCHASE_RETURN"
    >;
  },
) {
  if (!(m.qty > 0)) throw new ActionError("Quantity must be more than zero.");
  const stock = await lockStock(tx, m.branchId, m.partId);
  const onHand = Number(stock.qty);
  if (m.qty > onHand) {
    const part = await tx.part.findUnique({ where: { id: m.partId }, select: { name: true } });
    throw new ActionError(`Not enough stock of ${part?.name ?? "this part"}: ${onHand} on hand, ${m.qty} needed.`);
  }
  const qty = roundQty(onHand - m.qty);
  const unitCost = Number(stock.avgCost);
  await tx.stock.update({ where: { id: stock.id }, data: { qty } });
  const movement = await tx.stockMovement.create({
    data: {
      organizationId: m.organizationId,
      branchId: m.branchId,
      partId: m.partId,
      type: m.type,
      qty: -m.qty,
      unitCost,
      balanceAfter: qty,
      avgCostAfter: unitCost,
      refType: m.refType,
      refId: m.refId,
      note: m.note,
      userId: m.userId,
    },
  });
  return { unitCost, movement };
}
