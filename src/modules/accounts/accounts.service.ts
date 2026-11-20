import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { rupeesToPaise } from "@/modules/tax/gst";
import {
  ACCOUNTS_SETTINGS_KEY,
  DEFAULT_EXPENSE_APPROVAL_LIMIT,
  type cancelEntrySchema,
  type contraSchema,
  type expenseDecisionSchema,
  type expenseSchema,
  type incomeSchema,
  type payExpenseSchema,
} from "./accounts.schemas";
import { assertMoneyAccount, assertPaymentMode, recordMoney } from "./money.service";
import { expenseNeedsApproval } from "./pnl-logic";

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const r2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ settings

export async function getAccountsSettings(orgId: string) {
  const row = await db.setting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: ACCOUNTS_SETTINGS_KEY } },
  });
  const v = (row?.value ?? {}) as { expenseApprovalLimit?: number };
  return { expenseApprovalLimit: v.expenseApprovalLimit ?? DEFAULT_EXPENSE_APPROVAL_LIMIT };
}

export async function saveAccountsSettings(ctx: ActionContext, input: { expenseApprovalLimit: number }) {
  const orgId = ctx.user.organizationId;
  const before = await getAccountsSettings(orgId);
  await db.setting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: ACCOUNTS_SETTINGS_KEY } },
    create: { organizationId: orgId, key: ACCOUNTS_SETTINGS_KEY, value: input as Prisma.InputJsonValue },
    update: { value: input as Prisma.InputJsonValue },
  });
  await writeAudit(db, ctx.actor, {
    action: "UPDATE",
    entityType: "Setting",
    entityId: ACCOUNTS_SETTINGS_KEY,
    before,
    after: input,
  });
}

// ------------------------------------------------------------------ expenses

async function assertBranch(
  tx: Tx,
  ctx: ActionContext,
  branchId: string,
  permission: Parameters<typeof canAccessBranch>[1],
) {
  if (!canAccessBranch(ctx.user.access, permission, branchId))
    throw new ActionError("You can't record entries for this branch.");
  const b = await tx.branch.findFirst({
    where: { id: branchId, organizationId: ctx.user.organizationId, deletedAt: null },
  });
  if (!b) throw new ActionError("Branch not found.");
  return b;
}

async function payExpenseTx(
  tx: Tx,
  ctx: ActionContext,
  expense: { id: string; branchId: string; categoryId: string; total: Prisma.Decimal | number; description: string },
  p: { paymentModeId: string; moneyAccountId: string; reference: string | null; paidOn: Date },
) {
  await assertPaymentMode(tx, ctx.user.organizationId, p.paymentModeId, p.reference);
  await assertMoneyAccount(tx, p.moneyAccountId, expense.branchId);
  await tx.expense.update({
    where: { id: expense.id },
    data: { paidAt: p.paidOn, paymentModeId: p.paymentModeId, moneyAccountId: p.moneyAccountId },
  });
  const txn = await recordMoney(tx, {
    organizationId: ctx.user.organizationId,
    branchId: expense.branchId,
    moneyAccountId: p.moneyAccountId,
    date: p.paidOn,
    direction: "OUT",
    amount: Number(expense.total),
    source: "EXPENSE",
    refType: "Expense",
    refId: expense.id,
    narration: `Expense · ${expense.description}${p.reference ? ` · ${p.reference}` : ""}`.slice(0, 300),
    createdById: ctx.user.id,
  });
  await tx.moneyTransaction.update({ where: { id: txn.id }, data: { expenseCategoryId: expense.categoryId } });
}

export async function createExpense(ctx: ActionContext, input: z.output<typeof expenseSchema>) {
  const orgId = ctx.user.organizationId;
  const { expenseApprovalLimit } = await getAccountsSettings(orgId);
  return db.$transaction(async (tx) => {
    await assertBranch(tx, ctx, input.branchId, "expenses.create");
    const cat = await tx.expenseCategory.findFirst({
      where: { id: input.categoryId, organizationId: orgId, isActive: true },
    });
    if (!cat) throw new ActionError("Pick an expense category.");
    if (input.vendorId) {
      const v = await tx.vendor.findFirst({ where: { id: input.vendorId, organizationId: orgId, deletedAt: null } });
      if (!v) throw new ActionError("Vendor not found.");
    }
    const total = r2(input.amount + (input.gstAmount ?? 0));
    const canApprove = can(ctx.user.access, "expenses.approve");
    const pending = expenseNeedsApproval(rupeesToPaise(total), expenseApprovalLimit, canApprove);
    if (pending && input.payment.payNow)
      throw new ActionError(
        `Expenses above ₹${expenseApprovalLimit.toLocaleString("en-IN")} need approval first. Save it unpaid; pay it once approved.`,
      );
    const expense = await tx.expense.create({
      data: {
        organizationId: orgId,
        branchId: input.branchId,
        categoryId: cat.id,
        vendorId: input.vendorId,
        date: dateOnly(input.date),
        amount: input.amount,
        gstAmount: input.gstAmount ?? 0,
        total,
        description: input.description,
        billNo: input.billNo,
        status: pending ? "PENDING" : "APPROVED",
        requestedById: ctx.user.id,
        ...(pending ? {} : { approvedById: ctx.user.id, approvedAt: new Date() }),
      },
    });
    if (input.billFileId) {
      const file = await tx.fileAsset.findFirst({
        where: { id: input.billFileId, organizationId: orgId, deletedAt: null },
      });
      if (!file) throw new ActionError("The bill upload was not found. Upload it again.");
      await tx.attachment.create({
        data: { fileId: file.id, entityType: "Expense", entityId: expense.id, label: "Bill" },
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Expense",
      entityId: expense.id,
      branchId: expense.branchId,
      after: expense,
    });
    if (input.payment.payNow) {
      await payExpenseTx(tx, ctx, expense, {
        paymentModeId: input.payment.paymentModeId!,
        moneyAccountId: input.payment.moneyAccountId!,
        reference: input.payment.reference,
        paidOn: dateOnly(input.date),
      });
    }
    return { id: expense.id, pending };
  });
}

async function loadExpense(tx: Tx, ctx: ActionContext, id: string, permission: Parameters<typeof canAccessBranch>[1]) {
  const e = await tx.expense.findFirst({ where: { id, organizationId: ctx.user.organizationId, deletedAt: null } });
  if (!e) throw new ActionError("Expense not found.");
  if (!canAccessBranch(ctx.user.access, permission, e.branchId))
    throw new ActionError("You can't work on expenses of this branch.");
  return e;
}

export async function decideExpense(ctx: ActionContext, input: z.output<typeof expenseDecisionSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadExpense(tx, ctx, input.id, "expenses.approve");
    if (e.status !== "PENDING") throw new ActionError("This expense was already decided.");
    if (e.requestedById === ctx.user.id) throw new ActionError("You can't approve your own expense.");
    const after = await tx.expense.update({
      where: { id: e.id },
      data: { status: input.approve ? "APPROVED" : "REJECTED", approvedById: ctx.user.id, approvedAt: new Date() },
    });
    await writeAudit(tx, ctx.actor, {
      action: input.approve ? "APPROVE" : "REJECT",
      entityType: "Expense",
      entityId: e.id,
      branchId: e.branchId,
      before: { status: e.status },
      after: { status: after.status, note: input.note },
    });
  });
}

export async function payExpense(ctx: ActionContext, input: z.output<typeof payExpenseSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadExpense(tx, ctx, input.id, "expenses.pay");
    if (e.status !== "APPROVED") throw new ActionError("Only approved expenses can be paid.");
    if (e.paidAt) throw new ActionError("This expense is already paid.");
    await payExpenseTx(tx, ctx, e, {
      paymentModeId: input.paymentModeId,
      moneyAccountId: input.moneyAccountId,
      reference: input.reference,
      paidOn: dateOnly(input.paidOn),
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Expense",
      entityId: e.id,
      branchId: e.branchId,
      before: { paidAt: null },
      after: { paidAt: input.paidOn, moneyAccountId: input.moneyAccountId },
    });
  });
}

/** Cancel a wrong entry. A paid expense gets a day-book reversal. */
export async function cancelExpense(ctx: ActionContext, input: z.output<typeof cancelEntrySchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadExpense(tx, ctx, input.id, "expenses.create");
    if (e.status === "CANCELLED" || e.status === "REJECTED") throw new ActionError("This expense is already closed.");
    const own = e.requestedById === ctx.user.id && e.status === "PENDING";
    if (!own && !can(ctx.user.access, "expenses.approve"))
      throw new ActionError("Only someone who approves expenses can cancel this one.");
    await tx.expense.update({ where: { id: e.id }, data: { status: "CANCELLED" } });
    if (e.paidAt && e.moneyAccountId) {
      await recordMoney(tx, {
        organizationId: e.organizationId,
        branchId: e.branchId,
        moneyAccountId: e.moneyAccountId,
        date: dateOnly(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)),
        direction: "IN",
        amount: Number(e.total),
        source: "ADJUSTMENT",
        refType: "Expense",
        refId: e.id,
        narration: `Reversal: expense cancelled · ${input.reason}`.slice(0, 300),
        createdById: ctx.user.id,
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Expense",
      entityId: e.id,
      branchId: e.branchId,
      before: { status: e.status },
      after: { status: "CANCELLED", reason: input.reason },
    });
  });
}

// ------------------------------------------------------------------ other income

export async function createIncome(ctx: ActionContext, input: z.output<typeof incomeSchema>) {
  const orgId = ctx.user.organizationId;
  return db.$transaction(async (tx) => {
    await assertBranch(tx, ctx, input.branchId, "income.create");
    const cat = await tx.incomeCategory.findFirst({
      where: { id: input.categoryId, organizationId: orgId, isActive: true },
    });
    if (!cat) throw new ActionError("Pick an income category.");
    await assertPaymentMode(tx, orgId, input.paymentModeId, null);
    await assertMoneyAccount(tx, input.moneyAccountId, input.branchId);
    const income = await tx.income.create({
      data: {
        organizationId: orgId,
        branchId: input.branchId,
        categoryId: cat.id,
        date: dateOnly(input.date),
        amount: input.amount,
        description: input.description,
        paymentModeId: input.paymentModeId,
        moneyAccountId: input.moneyAccountId,
        createdById: ctx.user.id,
      },
    });
    const txn = await recordMoney(tx, {
      organizationId: orgId,
      branchId: input.branchId,
      moneyAccountId: input.moneyAccountId,
      date: income.date,
      direction: "IN",
      amount: input.amount,
      source: "OTHER_INCOME",
      refType: "Income",
      refId: income.id,
      narration: `${cat.name} · ${input.description}`.slice(0, 300),
      createdById: ctx.user.id,
    });
    await tx.moneyTransaction.update({ where: { id: txn.id }, data: { incomeCategoryId: cat.id } });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Income",
      entityId: income.id,
      branchId: income.branchId,
      after: income,
    });
    return income.id;
  });
}

export async function cancelIncome(ctx: ActionContext, input: z.output<typeof cancelEntrySchema>) {
  await db.$transaction(async (tx) => {
    const inc = await tx.income.findFirst({
      where: { id: input.id, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!inc) throw new ActionError("Income entry not found.");
    if (!canAccessBranch(ctx.user.access, "income.create", inc.branchId))
      throw new ActionError("You can't change entries of this branch.");
    await tx.income.update({ where: { id: inc.id }, data: { deletedAt: new Date() } });
    await recordMoney(tx, {
      organizationId: inc.organizationId,
      branchId: inc.branchId,
      moneyAccountId: inc.moneyAccountId,
      date: dateOnly(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)),
      direction: "OUT",
      amount: Number(inc.amount),
      source: "ADJUSTMENT",
      refType: "Income",
      refId: inc.id,
      narration: `Reversal: income cancelled · ${input.reason}`.slice(0, 300),
      createdById: ctx.user.id,
    });
    await writeAudit(tx, ctx.actor, {
      action: "DELETE",
      entityType: "Income",
      entityId: inc.id,
      branchId: inc.branchId,
      before: inc,
      after: { reason: input.reason },
    });
  });
}

// ------------------------------------------------------------------ contra (move money between own accounts)

export async function createContra(ctx: ActionContext, input: z.output<typeof contraSchema>) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.moneyAccount.findFirst({ where: { id: input.fromAccountId, organizationId: orgId, isActive: true } }),
      tx.moneyAccount.findFirst({ where: { id: input.toAccountId, organizationId: orgId, isActive: true } }),
    ]);
    if (!from || !to) throw new ActionError("Account not found.");
    if (from.branchId !== to.branchId)
      throw new ActionError("Both accounts must be of the same branch (e.g. cash deposited into that branch's bank).");
    if (!canAccessBranch(ctx.user.access, "accounts.contra", from.branchId))
      throw new ActionError("You can't move money in this branch.");
    const date = dateOnly(input.date);
    const entry = await tx.contraEntry.create({
      data: { fromAccountId: from.id, toAccountId: to.id, date, amount: input.amount, note: input.note },
    });
    const narration = `Transfer ${from.name} → ${to.name}${input.note ? ` · ${input.note}` : ""}`.slice(0, 300);
    for (const [acc, direction] of [
      [from, "OUT"],
      [to, "IN"],
    ] as const) {
      await recordMoney(tx, {
        organizationId: orgId,
        branchId: from.branchId,
        moneyAccountId: acc.id,
        date,
        direction,
        amount: input.amount,
        source: "CONTRA",
        refType: "ContraEntry",
        refId: entry.id,
        narration,
        createdById: ctx.user.id,
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "ContraEntry",
      entityId: entry.id,
      branchId: from.branchId,
      after: entry,
    });
  });
}
