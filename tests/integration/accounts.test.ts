/**
 * Integration test (real database) for Phase 5: expense approval, P&L figures, profit distribution.
 * Uses January 2020 so the demo data (current FY) doesn't interfere.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelIncome,
  createContra,
  createExpense,
  createIncome,
  decideExpense,
} from "@/modules/accounts/accounts.service";
import { createDistributionRun, deleteDistributionRun, lockDistributionRun } from "@/modules/accounts/partners.service";
import { pnlReport } from "@/modules/accounts/pnl.queries";
import { buildAccess } from "@/modules/rbac/access";
import type { ActionContext } from "@/modules/rbac/action";

const hasDb = !!process.env.DATABASE_URL;

async function ctxFor(email: string, onlyPermissions?: string[]): Promise<ActionContext> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      branches: true,
    },
  });
  const access = buildAccess({
    userId: u.id,
    organizationId: u.organizationId,
    assignedBranchIds: u.branches.map((b) => b.branchId),
    roles: onlyPermissions
      ? [{ scope: "ASSIGNED_BRANCHES", permissions: onlyPermissions }]
      : u.roles.map((r) => ({ scope: r.scope, permissions: r.role.permissions.map((p) => p.permission.key) })),
  });
  return {
    user: { id: u.id, name: u.name, email: u.email, image: null, organizationId: u.organizationId, access },
    activeBranchId: null,
    actor: { organizationId: u.organizationId, userId: u.id },
  };
}

describe.skipIf(!hasDb)("accounts", () => {
  let owner: ActionContext;
  let clerk: ActionContext; // can enter expenses, can't approve
  let ids: {
    pkd: string;
    mkm: string;
    rent: string;
    scrap: string;
    cashMode: string;
    pkdCash: string;
    pkdBank: string;
    mkmCash: string;
  };
  const expenseIds: string[] = [];
  const incomeIds: string[] = [];
  const runIds: string[] = [];
  const contraRefs: string[] = [];

  beforeAll(async () => {
    owner = await ctxFor("arun@demo.test");
    clerk = await ctxFor("frontdesk.pkd@demo.test", ["expenses.view", "expenses.create"]);
    const [pkd, mkm] = await Promise.all([
      db.branch.findFirstOrThrow({ where: { code: "PKD" } }),
      db.branch.findFirstOrThrow({ where: { code: "MKM" } }),
    ]);
    const acc = (branchId: string, type: "CASH" | "BANK") =>
      db.moneyAccount.findFirstOrThrow({ where: { branchId, type } });
    ids = {
      pkd: pkd.id,
      mkm: mkm.id,
      rent: (await db.expenseCategory.findFirstOrThrow({ where: { name: "Rent" } })).id,
      scrap: (await db.incomeCategory.findFirstOrThrow({ where: { name: "Scrap sale" } })).id,
      cashMode: (await db.paymentMode.findFirstOrThrow({ where: { name: "Cash" } })).id,
      pkdCash: (await acc(pkd.id, "CASH")).id,
      pkdBank: (await acc(pkd.id, "BANK")).id,
      mkmCash: (await acc(mkm.id, "CASH")).id,
    };
  });

  afterAll(async () => {
    await db.moneyTransaction.deleteMany({ where: { refId: { in: [...expenseIds, ...incomeIds, ...contraRefs] } } });
    await db.attachment.deleteMany({ where: { entityId: { in: expenseIds } } });
    await db.expense.deleteMany({ where: { id: { in: expenseIds } } });
    await db.income.deleteMany({ where: { id: { in: incomeIds } } });
    await db.contraEntry.deleteMany({ where: { id: { in: contraRefs } } });
    await db.profitDistributionRun.deleteMany({ where: { id: { in: runIds } } });
    await db.$disconnect();
  });

  const expense = (over: Record<string, unknown> = {}) => ({
    branchId: ids.pkd,
    categoryId: ids.rent,
    vendorId: null,
    date: "2020-01-15",
    amount: 4000,
    gstAmount: 0,
    description: "Test expense",
    billNo: null,
    billFileId: null,
    payment: { payNow: false, paymentModeId: null, moneyAccountId: null, reference: null },
    ...over,
  });

  it("small expenses count straight away; big ones wait for someone else's approval", async () => {
    const small = await createExpense(clerk, expense({ amount: 4000 }) as never);
    expenseIds.push(small.id);
    expect(small.pending).toBe(false);

    const big = await createExpense(clerk, expense({ amount: 9000, gstAmount: 1620 }) as never);
    expenseIds.push(big.id);
    expect(big.pending).toBe(true);
    await expect(
      createExpense(
        clerk,
        expense({
          amount: 9000,
          payment: { payNow: true, paymentModeId: ids.cashMode, moneyAccountId: ids.pkdCash, reference: null },
        }) as never,
      ),
    ).rejects.toThrow(/need approval first/);

    // The owner can approve, and their own big entries skip approval.
    const ownerBig = await createExpense(
      owner,
      expense({ amount: 20000, branchId: ids.mkm, gstAmount: 3600 }) as never,
    );
    expenseIds.push(ownerBig.id);
    expect(ownerBig.pending).toBe(false);
  });

  it("pending expenses aren't in the P&L until approved; GST is a cost only for the non-GST branch", async () => {
    const before = await pnlReport(owner.user, { from: "2020-01-01", to: "2020-01-31", activeBranchId: null });
    const pkd = before.branches.find((b) => b.id === ids.pkd)!;
    const mkm = before.branches.find((b) => b.id === ids.mkm)!;
    expect(pkd.pnl.costs).toBe(4000_00); // the 9000 + GST one is still pending
    expect(mkm.pnl.costs).toBe(23600_00); // Mukkam has no GSTIN: GST is a cost

    const pending = await db.expense.findFirstOrThrow({ where: { id: { in: expenseIds }, status: "PENDING" } });
    await expect(
      decideExpense(await ctxFor("frontdesk.pkd@demo.test", ["expenses.approve"]), {
        id: pending.id,
        approve: true,
        note: null,
      }),
    ).rejects.toThrow(/own expense/);
    await decideExpense(owner, { id: pending.id, approve: true, note: null });

    const after = await pnlReport(owner.user, { from: "2020-01-01", to: "2020-01-31", activeBranchId: null });
    expect(after.branches.find((b) => b.id === ids.pkd)!.pnl.costs).toBe(13000_00); // Palakkad claims GST back
  });

  it("other income adds to the P&L and the day book; cancelling reverses it", async () => {
    const id = await createIncome(owner, {
      branchId: ids.pkd,
      categoryId: ids.scrap,
      date: "2020-01-10",
      amount: 1500,
      description: "Test scrap",
      paymentModeId: ids.cashMode,
      moneyAccountId: ids.pkdCash,
    });
    incomeIds.push(id);
    const r = await pnlReport(owner.user, { from: "2020-01-01", to: "2020-01-31", activeBranchId: null });
    expect(r.branches.find((b) => b.id === ids.pkd)!.pnl.income).toBe(1500_00);
    expect(r.combined.net).toBe(1500_00 - 13000_00 - 23600_00);

    await cancelIncome(owner, { id, reason: "Test cancel" });
    const txns = await db.moneyTransaction.findMany({ where: { refId: id }, orderBy: { createdAt: "asc" } });
    expect(txns.map((t) => t.direction)).toEqual(["IN", "OUT"]);
  });

  it("profit with no shares in force stays undistributed; locking freezes it", async () => {
    const runId = await createDistributionRun(owner, { periodFrom: "2020-01-01", periodTo: "2020-01-31", note: null });
    runIds.push(runId);
    const run = await db.profitDistributionRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: true } });
    expect(run.lines).toHaveLength(0);
    const summary = run.summary as { branchId: string; net: number; undistributed: number }[];
    const pkd = summary.find((s) => s.branchId === ids.pkd)!;
    expect(pkd.undistributed).toBe(pkd.net);

    await lockDistributionRun(owner, runId);
    await expect(deleteDistributionRun(owner, runId)).rejects.toThrow(/locked/);
    const second = await createDistributionRun(owner, { periodFrom: "2020-01-15", periodTo: "2020-02-15", note: null });
    runIds.push(second);
    await expect(lockDistributionRun(owner, second)).rejects.toThrow(/already covers/);
  });

  it("money moves only between accounts of the same branch", async () => {
    await expect(
      createContra(owner, {
        fromAccountId: ids.pkdCash,
        toAccountId: ids.mkmCash,
        date: "2020-01-20",
        amount: 100,
        note: null,
      }),
    ).rejects.toThrow(/same branch/);
    await createContra(owner, {
      fromAccountId: ids.pkdCash,
      toAccountId: ids.pkdBank,
      date: "2020-01-20",
      amount: 100,
      note: "Test deposit",
    });
    const entry = await db.contraEntry.findFirstOrThrow({
      where: { note: "Test deposit" },
      orderBy: { createdAt: "desc" },
    });
    contraRefs.push(entry.id);
    expect(await db.moneyTransaction.count({ where: { refId: entry.id } })).toBe(2);
  });
});
