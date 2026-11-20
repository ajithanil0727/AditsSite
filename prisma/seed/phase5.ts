/**
 * Phase 5 demo data: income/expense categories, a month of expenses (one waiting for approval),
 * other income, partner capital and a drawing, and a cash deposit. Idempotent: skips when expense
 * categories exist. Amounts are DEMO figures.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { DEMO } from "./mode";

type Ctx = { orgId: string; branchIds: Record<string, string>; userIds: Record<string, string> };
const DAY = 86_400_000;
const istToday = () => {
  const d = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export async function seedPhase5(db: PrismaClient, ctx: Ctx) {
  const { orgId, branchIds, userIds } = ctx;
  if ((await db.expenseCategory.count({ where: { organizationId: orgId } })) > 0) return;

  const expenseNames = [
    "Rent",
    "Electricity",
    "Salaries",
    "Internet & phone",
    "Marketing & ads",
    "Travel & conveyance",
    "Repairs & maintenance",
    "Lab consumables",
    "Office supplies",
    "Bank charges",
    "Professional fees",
    "Miscellaneous",
  ];
  const incomeNames = ["Workshop / seminar", "Scrap sale", "Interest", "Other"];
  await db.expenseCategory.createMany({ data: expenseNames.map((name) => ({ organizationId: orgId, name })) });
  await db.incomeCategory.createMany({ data: incomeNames.map((name) => ({ organizationId: orgId, name })) });
  if (!DEMO) return; // demo expenses, income and partner entries below
  const exp = Object.fromEntries(
    (await db.expenseCategory.findMany({ where: { organizationId: orgId } })).map((c) => [c.name, c.id]),
  );
  const inc = Object.fromEntries(
    (await db.incomeCategory.findMany({ where: { organizationId: orgId } })).map((c) => [c.name, c.id]),
  );
  const cash = await db.paymentMode.findFirst({ where: { organizationId: orgId, name: "Cash" } });
  const bankMode =
    (await db.paymentMode.findFirst({ where: { organizationId: orgId, name: { contains: "Bank" } } })) ?? cash;
  const owner = userIds["arun@demo.test"];
  const accountant = userIds["accounts@demo.test"] ?? owner;
  const frontDesk = userIds["frontdesk.pkd@demo.test"] ?? owner;
  const today = istToday();

  const accounts = await db.moneyAccount.findMany({ where: { organizationId: orgId } });
  const acc = (branchId: string, type: "CASH" | "BANK") =>
    accounts.find((a) => a.branchId === branchId && a.type === type)!;

  const expenses: {
    branch: string;
    cat: string;
    days: number;
    amount: number;
    gst?: number;
    desc: string;
    vendor?: string;
    paid: "CASH" | "BANK" | null;
    pending?: boolean;
  }[] = [
    { branch: "PKD", cat: "Rent", days: 18, amount: 25000, desc: "Rent for the month", paid: "BANK" },
    { branch: "PKD", cat: "Electricity", days: 12, amount: 4380, desc: "KSEB bill", paid: "BANK" },
    { branch: "PKD", cat: "Internet & phone", days: 10, amount: 1180, gst: 212.4, desc: "Broadband", paid: "BANK" },
    { branch: "PKD", cat: "Lab consumables", days: 7, amount: 2350, desc: "Flux, solder wire, IPA", paid: "CASH" },
    {
      branch: "PKD",
      cat: "Travel & conveyance",
      days: 4,
      amount: 640,
      desc: "Auto fare for parts pickup",
      paid: "CASH",
    },
    {
      branch: "PKD",
      cat: "Marketing & ads",
      days: 2,
      amount: 9000,
      gst: 1620,
      desc: "Instagram ads for the new batch",
      paid: null,
      pending: true,
    },
    { branch: "MKM", cat: "Rent", days: 18, amount: 15000, desc: "Rent for the month", paid: "BANK" },
    { branch: "MKM", cat: "Electricity", days: 11, amount: 2210, desc: "KSEB bill", paid: "CASH" },
    { branch: "MKM", cat: "Office supplies", days: 5, amount: 760, desc: "Receipt books, stationery", paid: "CASH" },
  ];
  for (const e of expenses) {
    const branchId = branchIds[e.branch];
    if (!branchId) continue;
    const date = new Date(today.getTime() - e.days * DAY);
    const total = Math.round((e.amount + (e.gst ?? 0)) * 100) / 100;
    const account = e.paid ? acc(branchId, e.paid) : null;
    const row = await db.expense.create({
      data: {
        organizationId: orgId,
        branchId,
        categoryId: exp[e.cat],
        date,
        amount: e.amount,
        gstAmount: e.gst ?? 0,
        total,
        description: e.desc,
        status: e.pending ? "PENDING" : "APPROVED",
        requestedById: e.pending ? frontDesk : accountant,
        ...(e.pending ? {} : { approvedById: accountant, approvedAt: date }),
        ...(account
          ? { paidAt: date, paymentModeId: (e.paid === "CASH" ? cash : bankMode)!.id, moneyAccountId: account.id }
          : {}),
      },
    });
    if (account) {
      await db.moneyTransaction.create({
        data: {
          organizationId: orgId,
          branchId,
          moneyAccountId: account.id,
          date,
          direction: "OUT",
          amount: total,
          source: "EXPENSE",
          refType: "Expense",
          refId: row.id,
          expenseCategoryId: exp[e.cat],
          narration: `Expense · ${e.desc}`,
          createdById: accountant,
        },
      });
    }
  }

  // Other income
  if (branchIds.PKD) {
    const date = new Date(today.getTime() - 6 * DAY);
    const account = acc(branchIds.PKD, "CASH");
    const row = await db.income.create({
      data: {
        organizationId: orgId,
        branchId: branchIds.PKD,
        categoryId: inc["Scrap sale"],
        date,
        amount: 1800,
        description: "Old boards and dead batteries sold for recycling",
        paymentModeId: cash!.id,
        moneyAccountId: account.id,
        createdById: accountant,
      },
    });
    await db.moneyTransaction.create({
      data: {
        organizationId: orgId,
        branchId: branchIds.PKD,
        moneyAccountId: account.id,
        date,
        direction: "IN",
        amount: 1800,
        source: "OTHER_INCOME",
        refType: "Income",
        refId: row.id,
        incomeCategoryId: inc["Scrap sale"],
        narration: "Scrap sale · old boards and batteries",
        createdById: accountant,
      },
    });
  }

  // Partner capital (start of the FY) and a drawing
  const partners = await db.partner.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } });
  const fy = (() => {
    const y = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    return new Date(Date.UTC(y, 3, 1));
  })();
  for (const [i, p] of partners.entries()) {
    const branch = i === 2 ? "MKM" : "PKD";
    const branchId = branchIds[branch];
    if (!branchId) continue;
    const account = acc(branchId, "BANK");
    const amount = [500000, 400000, 300000][i] ?? 200000;
    const t = await db.partnerTransaction.create({
      data: {
        organizationId: orgId,
        partnerId: p.id,
        branchId,
        type: "CAPITAL_IN",
        amount,
        date: fy,
        moneyAccountId: account.id,
        note: "Opening capital",
        createdById: owner,
      },
    });
    await db.moneyTransaction.create({
      data: {
        organizationId: orgId,
        branchId,
        moneyAccountId: account.id,
        date: fy,
        direction: "IN",
        amount,
        source: "PARTNER_CAPITAL",
        refType: "PartnerTransaction",
        refId: t.id,
        narration: `${p.name} · capital in`,
        createdById: owner,
      },
    });
  }
  if (partners[0] && branchIds.PKD) {
    const date = new Date(today.getTime() - 3 * DAY);
    const account = acc(branchIds.PKD, "BANK");
    const t = await db.partnerTransaction.create({
      data: {
        organizationId: orgId,
        partnerId: partners[0].id,
        branchId: branchIds.PKD,
        type: "DRAWING",
        amount: 20000,
        date,
        moneyAccountId: account.id,
        note: "Monthly drawing",
        createdById: owner,
      },
    });
    await db.moneyTransaction.create({
      data: {
        organizationId: orgId,
        branchId: branchIds.PKD,
        moneyAccountId: account.id,
        date,
        direction: "OUT",
        amount: 20000,
        source: "PARTNER_DRAWING",
        refType: "PartnerTransaction",
        refId: t.id,
        narration: `${partners[0].name} · drawing`,
        createdById: owner,
      },
    });
  }
}
