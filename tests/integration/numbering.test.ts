/**
 * Integration test (real database): concurrent document numbers must be unique and gap-free.
 * Needs DATABASE_URL (see .env.example). Cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { nextDocNumber } from "@/modules/numbering/numbering.service";

const hasDb = !!process.env.DATABASE_URL;
const code = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
let branchId = "";

describe.skipIf(!hasDb)("nextDocNumber", () => {
  beforeAll(async () => {
    const org = await db.organization.findFirstOrThrow();
    const branch = await db.branch.create({
      data: {
        organizationId: org.id,
        code,
        name: "Test branch",
        kind: "SERVICE",
        stateCode: "32",
        addressLine1: "Test",
        city: "Kochi",
        pincode: "682016",
        phone: "9847000000",
      },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    if (!branchId) return void (await db.$disconnect());
    await db.numberSeries.deleteMany({ where: { branchId } });
    await db.branch.delete({ where: { id: branchId } });
    await db.$disconnect();
  });

  it("hands out unique, sequential numbers under concurrency", async () => {
    const date = new Date("2026-11-17T10:00:00Z");
    const numbers = await Promise.all(
      Array.from({ length: 12 }, () =>
        db.$transaction((tx) => nextDocNumber(tx, { branchId, docType: "JOB_CARD", date })),
      ),
    );
    expect(new Set(numbers).size).toBe(12);
    const seqs = numbers.map((n) => Number(n.split("/").at(-1))).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(numbers).toContain(`${code}/JC/26-27/00001`);
  });

  it("starts a fresh series in a new financial year", async () => {
    const n = await db.$transaction((tx) =>
      nextDocNumber(tx, { branchId, docType: "JOB_CARD", date: new Date("2027-04-02T10:00:00Z") }),
    );
    expect(n).toBe(`${code}/JC/27-28/00001`);
  });

  it("doesn't burn a number when the transaction rolls back", async () => {
    const date = new Date("2026-11-17T10:00:00Z");
    await expect(
      db.$transaction(async (tx) => {
        await nextDocNumber(tx, { branchId, docType: "QUOTATION", date });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const n = await db.$transaction((tx) => nextDocNumber(tx, { branchId, docType: "QUOTATION", date }));
    expect(n).toBe(`${code}/QT/26-27/00001`);
  });
});
