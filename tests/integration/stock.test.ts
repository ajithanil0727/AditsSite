/**
 * Integration test (real database): weighted-average stock, no negative stock, concurrency.
 * Creates its own part and cleans up.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { issueStock, receiveStock } from "@/modules/inventory/stock.service";

const hasDb = !!process.env.DATABASE_URL;
let orgId = "";
let branchA = "";
let branchB = "";
let partId = "";

describe.skipIf(!hasDb)("stock service", () => {
  beforeAll(async () => {
    const org = await db.organization.findFirstOrThrow();
    orgId = org.id;
    const branches = await db.branch.findMany({
      where: { organizationId: orgId, deletedAt: null },
      take: 2,
      orderBy: { sortOrder: "asc" },
    });
    [branchA, branchB] = branches.map((b) => b.id);
    const unit = await db.unit.findFirstOrThrow({ where: { organizationId: orgId } });
    const part = await db.part.create({
      data: { organizationId: orgId, sku: `TEST-${Date.now()}`, name: "Integration test part", unitId: unit.id },
    });
    partId = part.id;
  });

  afterAll(async () => {
    if (!partId) return void (await db.$disconnect());
    await db.stockMovement.deleteMany({ where: { partId } });
    await db.stock.deleteMany({ where: { partId } });
    await db.part.delete({ where: { id: partId } });
    await db.$disconnect();
  });

  const base = () => ({ organizationId: orgId, branchId: branchA, partId });

  it("receives stock at weighted average cost", async () => {
    await db.$transaction((tx) => receiveStock(tx, { ...base(), qty: 10, unitCost: 100, type: "PURCHASE" }));
    await db.$transaction((tx) => receiveStock(tx, { ...base(), qty: 10, unitCost: 130, type: "PURCHASE" }));
    const s = await db.stock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branchA, partId } } });
    expect(Number(s.qty)).toBe(20);
    expect(Number(s.avgCost)).toBe(115);
  });

  it("issues at average cost and refuses to go negative", async () => {
    const { unitCost } = await db.$transaction((tx) => issueStock(tx, { ...base(), qty: 5, type: "JOB_ISSUE" }));
    expect(unitCost).toBe(115);
    await expect(db.$transaction((tx) => issueStock(tx, { ...base(), qty: 16, type: "JOB_ISSUE" }))).rejects.toThrow(
      /Not enough stock/,
    );
    const s = await db.stock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branchA, partId } } });
    expect(Number(s.qty)).toBe(15);
  });

  it("concurrent issues never oversell", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        db.$transaction((tx) => issueStock(tx, { ...base(), qty: 3, type: "JOB_ISSUE" })),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(5); // 15 on hand / 3 each
    const s = await db.stock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branchA, partId } } });
    expect(Number(s.qty)).toBe(0);
  });

  it("a transfer carries the sender's cost to the receiver", async () => {
    await db.$transaction((tx) => receiveStock(tx, { ...base(), qty: 4, unitCost: 200, type: "ADJUSTMENT_IN" }));
    const { unitCost } = await db.$transaction((tx) => issueStock(tx, { ...base(), qty: 2, type: "TRANSFER_OUT" }));
    await db.$transaction((tx) =>
      receiveStock(tx, { ...base(), branchId: branchB, qty: 2, unitCost, type: "TRANSFER_IN" }),
    );
    const b = await db.stock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branchB, partId } } });
    expect(Number(b.qty)).toBe(2);
    expect(Number(b.avgCost)).toBe(200);
    const ledger = await db.stockMovement.count({ where: { partId } });
    expect(ledger).toBeGreaterThanOrEqual(10);
  });
});
