import "server-only";
import type { Direction, MoneyTxnSource } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db";
import { ActionError } from "@/modules/rbac/action";

/** Day-book entry for every rupee in or out. Written by the services that record payments. */
export async function recordMoney(
  tx: Tx,
  m: {
    organizationId: string;
    branchId: string;
    moneyAccountId: string;
    date: Date;
    direction: Direction;
    amount: number; // rupees, positive
    source: MoneyTxnSource;
    refType: string;
    refId: string;
    narration?: string;
    createdById: string;
  },
) {
  if (!(m.amount > 0)) throw new ActionError("Amount must be more than zero.");
  return tx.moneyTransaction.create({ data: m });
}

/** The cash/bank account must belong to the branch and be active (callers check branch access). */
export async function assertMoneyAccount(tx: Tx, accountId: string, branchId: string) {
  const acc = await tx.moneyAccount.findFirst({ where: { id: accountId, branchId, isActive: true } });
  if (!acc) throw new ActionError("Pick a cash/bank account of this branch.");
  return acc;
}

export async function assertPaymentMode(
  tx: Tx,
  organizationId: string,
  modeId: string,
  reference: string | null | undefined,
) {
  const mode = await tx.paymentMode.findFirst({ where: { id: modeId, organizationId, isActive: true } });
  if (!mode) throw new ActionError("Pick a payment mode.");
  if (mode.requiresReference && !reference?.trim()) throw new ActionError(`${mode.name} needs a reference number.`);
  return mode;
}
