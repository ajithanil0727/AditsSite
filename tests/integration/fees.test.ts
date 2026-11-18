/**
 * Integration test (real database) for the fee rules, through the real services.
 * Builds an ActionContext for seeded users (owner = unlimited discount; counsellor = limit 0).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildAccess } from "@/modules/rbac/access";
import type { ActionContext } from "@/modules/rbac/action";
import {
  admit,
  cancelReceipt,
  collectFee,
  decideDiscount,
  decideRefund,
  dropEnrollment,
  requestDiscount,
  requestRefund,
  transferEnrollment,
} from "@/modules/students/students.service";

const hasDb = !!process.env.DATABASE_URL;

async function ctxFor(email: string): Promise<ActionContext> {
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
    roles: u.roles.map((r) => ({
      scope: r.scope,
      permissions: r.role.permissions.map((p) => p.permission.key),
      discountLimitPercent: Number(r.role.discountLimitPercent),
      discountLimitAmount: Number(r.role.discountLimitAmount),
    })),
  });
  return {
    user: { id: u.id, name: u.name, email: u.email, image: null, organizationId: u.organizationId, access },
    activeBranchId: null,
    actor: { organizationId: u.organizationId, userId: u.id },
  };
}

let owner: ActionContext;
let counsellor: ActionContext;
let ids: { koc: string; tvm: string; course: string; cash: string; mode: string; tvmCash: string };
const phone = `8${String(Date.now()).slice(-9)}`;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const created: string[] = [];

describe.skipIf(!hasDb)("fees", () => {
  beforeAll(async () => {
    owner = await ctxFor("arun@demo.test");
    counsellor = await ctxFor("frontdesk.koc@demo.test");
    const [koc, tvm] = await Promise.all([
      db.branch.findFirstOrThrow({ where: { code: "KOC" } }),
      db.branch.findFirstOrThrow({ where: { code: "TVM" } }),
    ]);
    const course = await db.course.findFirstOrThrow({ where: { code: "MOB-ADV" } });
    const cash = await db.moneyAccount.findFirstOrThrow({ where: { branchId: koc.id, type: "CASH" } });
    const tvmCash = await db.moneyAccount.findFirstOrThrow({ where: { branchId: tvm.id, type: "CASH" } });
    const mode = await db.paymentMode.findFirstOrThrow({ where: { name: "Cash" } });
    ids = { koc: koc.id, tvm: tvm.id, course: course.id, cash: cash.id, mode: mode.id, tvmCash: tvmCash.id };
  });

  afterAll(async () => {
    for (const studentId of created) {
      const enrollments = await db.enrollment.findMany({ where: { studentId } });
      const eIds = enrollments.map((e) => e.id);
      const pays = await db.feePayment.findMany({ where: { enrollmentId: { in: eIds } } });
      const refunds = await db.feeRefund.findMany({ where: { enrollmentId: { in: eIds } } });
      await db.moneyTransaction.deleteMany({
        where: { refId: { in: [...pays.map((p) => p.id), ...refunds.map((r) => r.id)] } },
      });
      await db.feePaymentAllocation.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
      await db.feePayment.deleteMany({ where: { enrollmentId: { in: eIds } } });
      await db.feeRefund.deleteMany({ where: { enrollmentId: { in: eIds } } });
      await db.discountRequest.deleteMany({ where: { enrollmentId: { in: eIds } } });
      await db.enrollmentTransfer.deleteMany({ where: { enrollmentId: { in: eIds } } });
      await db.feeInstallment.deleteMany({ where: { enrollmentId: { in: eIds } } });
      await db.enrollment.deleteMany({ where: { studentId } });
      await db.student.delete({ where: { id: studentId } });
    }
    await db.$disconnect();
  });

  const admission = (over: Record<string, unknown> = {}) => ({
    branchId: ids.koc,
    studentId: null,
    student: {
      name: "Fee Test Student",
      phone,
      altPhone: null,
      email: null,
      dob: null,
      gender: null,
      guardianName: null,
      guardianPhone: null,
      address: null,
      city: null,
      state: null,
      pincode: null,
      qualification: null,
    },
    courseId: ids.course,
    batchId: null,
    enrolledAt: today,
    discountAmount: null,
    discountReason: null,
    schedule: [
      { label: "At admission", amount: 14000, dueDate: today },
      { label: "Instalment 2", amount: 10500, dueDate: today },
      { label: "Instalment 3", amount: 10500, dueDate: today },
    ],
    payment: { amount: 10000, paymentModeId: ids.mode, moneyAccountId: ids.cash, reference: null },
    ...over,
  });

  let enrollmentId = "";

  it("admits with a discount within the owner's limit and allocates the first payment", async () => {
    const r = await admit(
      owner,
      admission({
        discountAmount: 2000,
        discountReason: "Early bird",
        schedule: [
          { label: "At admission", amount: 13000, dueDate: today },
          { label: "Instalment 2", amount: 10000, dueDate: today },
          { label: "Instalment 3", amount: 10000, dueDate: today },
        ],
      }) as never,
    );
    created.push(r.studentId);
    enrollmentId = r.enrollmentId;
    expect(r.discountPending).toBe(false);
    const e = await db.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(Number(e.netFee)).toBe(33000);
    expect(e.installments.map((i) => [Number(i.paidAmount), i.status])).toEqual([
      [10000, "PARTIAL"],
      [0, "DUE"],
      [0, "DUE"],
    ]);
  });

  it("rejects a schedule that doesn't add up to the net fee (nothing is saved)", async () => {
    const badPhone = `7${phone.slice(1)}`;
    const r = admit(
      owner,
      admission({
        student: { ...admission().student, phone: badPhone },
        schedule: [{ label: "x", amount: 100, dueDate: today }],
      }) as never,
    );
    await expect(r).rejects.toThrow(/add up/);
    expect(await db.student.count({ where: { phone: badPhone } })).toBe(0);
  });

  it("settles oldest first and refuses over-payment", async () => {
    await collectFee(owner, {
      enrollmentId,
      amount: 8000,
      paymentModeId: ids.mode,
      moneyAccountId: ids.cash,
      reference: null,
      paidAt: today,
      notes: null,
    });
    const e = await db.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(e.installments.map((i) => i.status)).toEqual(["PAID", "PARTIAL", "DUE"]);
    await expect(
      collectFee(owner, {
        enrollmentId,
        amount: 15001,
        paymentModeId: ids.mode,
        moneyAccountId: ids.cash,
        reference: null,
        paidAt: today,
        notes: null,
      }),
    ).rejects.toThrow(/Only ₹15000.00 is due/);
  });

  it("cancelling a receipt makes the instalments due again", async () => {
    const pay = await db.feePayment.findFirstOrThrow({ where: { enrollmentId, amount: 8000 } });
    await cancelReceipt(owner, { paymentId: pay.id, reason: "Entered twice" });
    const e = await db.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(e.installments.map((i) => [Number(i.paidAmount), i.status])).toEqual([
      [10000, "PARTIAL"],
      [0, "DUE"],
      [0, "DUE"],
    ]);
    const reversal = await db.moneyTransaction.findFirst({ where: { refId: pay.id, direction: "OUT" } });
    expect(reversal).not.toBeNull();
  });

  it("a counsellor's discount needs approval, and nobody approves their own", async () => {
    const r = await requestDiscount(counsellor, { enrollmentId, amount: 1000, reason: "Sibling" });
    expect(r.approved).toBe(false);
    const req = await db.discountRequest.findFirstOrThrow({ where: { enrollmentId, status: "PENDING" } });
    await expect(decideDiscount(counsellor, { id: req.id, approve: true, note: null })).rejects.toThrow();
    await decideDiscount(owner, { id: req.id, approve: true, note: null });
    const e = await db.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(Number(e.netFee)).toBe(32000);
    expect(Number(e.installments[2].amount)).toBe(9000); // the last instalment is reduced
  });

  it("refunds can't exceed what was received and need someone else's approval", async () => {
    await expect(requestRefund(owner, { enrollmentId, amount: 10001, reason: "x" })).rejects.toThrow(
      /At most ₹10000.00/,
    );
    await requestRefund(owner, { enrollmentId, amount: 2000, reason: "Overpaid" });
    const r = await db.feeRefund.findFirstOrThrow({ where: { enrollmentId, status: "PENDING" } });
    await expect(decideRefund(owner, { id: r.id, approve: true, note: null })).rejects.toThrow(/own request/);
    await decideRefund(await ctxFor("accounts@demo.test"), { id: r.id, approve: true, note: null });
    expect((await db.feeRefund.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("APPROVED");
    // Pending/approved refunds count against what's still refundable
    await expect(requestRefund(owner, { enrollmentId, amount: 8001, reason: "x" })).rejects.toThrow(/At most ₹8000.00/);
  });

  it("transfer moves future dues to the new branch; dropping out waives what's unpaid", async () => {
    await transferEnrollment(owner, { enrollmentId, toBranchId: ids.tvm, toBatchId: null, reason: "Moved city" });
    const pay = await collectFee(owner, {
      enrollmentId,
      amount: 1000,
      paymentModeId: ids.mode,
      moneyAccountId: ids.tvmCash,
      reference: null,
      paidAt: today,
      notes: null,
    });
    const p = await db.feePayment.findUniqueOrThrow({ where: { id: pay.id } });
    expect(p.branchId).toBe(ids.tvm);
    expect(p.receiptNo).toMatch(/^TVM\//);

    await dropEnrollment(owner, { enrollmentId, reason: "Personal reasons" });
    const e = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { installments: true } });
    expect(e.status).toBe("DROPPED");
    expect(e.installments.filter((i) => i.status === "DUE" || i.status === "PARTIAL")).toHaveLength(0);
    await expect(
      collectFee(owner, {
        enrollmentId,
        amount: 100,
        paymentModeId: ids.mode,
        moneyAccountId: ids.tvmCash,
        reference: null,
        paidAt: today,
        notes: null,
      }),
    ).rejects.toThrow(/dropped/);
  });
});
