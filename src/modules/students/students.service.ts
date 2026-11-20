import "server-only";
import type { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { assertMoneyAccount, assertPaymentMode, recordMoney } from "@/modules/accounts/money.service";
import { writeAudit } from "@/modules/audit/audit.service";
import {
  allocatePayment,
  applyDiscount,
  discountNeedsApproval,
  statusAfter,
  totalDue,
  validateSchedule,
  type Instalment,
} from "@/modules/fees/fee-logic";
import { convertLeadOnCreate } from "@/modules/leads/leads.service";
import { revalidateSite } from "@/modules/website/site.data";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { can, canAccessBranch, scopeOf, type Access } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { paiseToDecimalString, rupeesToPaise } from "@/modules/tax/gst";
import type { PermissionKey } from "@/lib/permissions";
import type {
  admissionSchema,
  attendanceSchema,
  cancelReceiptSchema,
  collectFeeSchema,
  decisionSchema,
  discountRequestSchema,
  dropSchema,
  payRefundSchema,
  refundRequestSchema,
  transferSchema,
  updateStudentSchema,
  waiveSchema,
} from "./students.schemas";

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const toDec = paiseToDecimalString;

// ---------------------------------------------------------------- helpers

async function loadEnrollment(tx: Tx, ctx: ActionContext, id: string, permission: PermissionKey) {
  const e = await tx.enrollment.findFirst({
    where: { id, organizationId: ctx.user.organizationId, deletedAt: null },
    include: { student: true, course: true, installments: { orderBy: { sequence: "asc" } } },
  });
  if (!e) throw new ActionError("Enrollment not found.");
  if (!canAccessBranch(ctx.user.access, permission, e.branchId))
    throw new ActionError("This student belongs to a branch you can't access.");
  return e;
}

function asInstalments(
  rows: { id: string; sequence: number; amount: unknown; paidAmount: unknown; status: Instalment["status"] }[],
): Instalment[] {
  return rows.map((r) => ({
    id: r.id,
    sequence: r.sequence,
    amount: rupeesToPaise(String(r.amount)),
    paid: rupeesToPaise(String(r.paidAmount)),
    status: r.status,
  }));
}

/** Net money kept for an enrollment: receipts (not cancelled) − refunds paid out. Paise. */
async function netReceived(tx: Tx, enrollmentId: string) {
  const [pays, refunds] = await Promise.all([
    tx.feePayment.findMany({ where: { enrollmentId, cancelledAt: null }, select: { amount: true } }),
    tx.feeRefund.findMany({
      where: { enrollmentId, status: "APPROVED", paidAt: { not: null } },
      select: { amount: true },
    }),
  ]);
  return (
    pays.reduce((a, p) => a + rupeesToPaise(p.amount), 0) - refunds.reduce((a, r) => a + rupeesToPaise(r.amount), 0)
  );
}

function needsApproval(access: Access, courseFeePaise: number, discountPaise: number) {
  return discountNeedsApproval({
    courseFeePaise,
    discountPaise,
    limitPercent: access.discountLimitPercent,
    limitAmountRupees: access.discountLimitAmount,
  });
}

/** Apply an approved discount: lower unpaid instalments (last first) and the enrollment's net fee. */
async function applyApprovedDiscount(tx: Tx, enrollmentId: string, amountPaise: number) {
  const e = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { installments: true } });
  let cuts: Map<string, number>;
  try {
    cuts = applyDiscount(asInstalments(e.installments), amountPaise);
  } catch (err) {
    throw new ActionError((err as Error).message);
  }
  for (const [id, newAmount] of cuts) {
    const inst = e.installments.find((i) => i.id === id)!;
    const paid = rupeesToPaise(inst.paidAmount);
    await tx.feeInstallment.update({
      where: { id },
      data: {
        amount: toDec(newAmount),
        status: newAmount === 0 && paid === 0 ? "WAIVED" : statusAfter(newAmount, paid),
        waivedReason: newAmount === 0 ? "Discount" : null,
      },
    });
  }
  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: {
      discountAmount: toDec(rupeesToPaise(e.discountAmount) + amountPaise),
      netFee: toDec(rupeesToPaise(e.netFee) - amountPaise),
    },
  });
}

async function collectTx(
  tx: Tx,
  ctx: ActionContext,
  enrollmentId: string,
  input: {
    amount: number;
    paymentModeId: string;
    moneyAccountId: string;
    reference: string | null;
    paidAt: Date;
    notes?: string | null;
  },
) {
  const e = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { installments: true, student: true },
  });
  if (e.status === "DROPPED") throw new ActionError("This student has dropped out. Collecting fees isn't possible.");
  const paise = rupeesToPaise(input.amount);
  let allocations: { instalmentId: string; amount: number }[];
  try {
    allocations = allocatePayment(asInstalments(e.installments), paise);
  } catch (err) {
    throw new ActionError((err as Error).message);
  }
  await assertPaymentMode(tx, ctx.user.organizationId, input.paymentModeId, input.reference);
  // Fees are collected by (and count as income of) the student's current branch.
  await assertMoneyAccount(tx, input.moneyAccountId, e.branchId);
  const receiptNo = await nextDocNumber(tx, { branchId: e.branchId, docType: "FEE_RECEIPT", date: input.paidAt });
  const pay = await tx.feePayment.create({
    data: {
      organizationId: e.organizationId,
      branchId: e.branchId,
      enrollmentId: e.id,
      receiptNo,
      paidAt: input.paidAt,
      amount: toDec(paise),
      paymentModeId: input.paymentModeId,
      moneyAccountId: input.moneyAccountId,
      reference: input.reference,
      collectedById: ctx.user.id,
      notes: input.notes ?? null,
      allocations: { create: allocations.map((a) => ({ installmentId: a.instalmentId, amount: toDec(a.amount) })) },
    },
  });
  for (const a of allocations) {
    const inst = e.installments.find((i) => i.id === a.instalmentId)!;
    const paid = rupeesToPaise(inst.paidAmount) + a.amount;
    await tx.feeInstallment.update({
      where: { id: inst.id },
      data: { paidAmount: toDec(paid), status: statusAfter(rupeesToPaise(inst.amount), paid) },
    });
  }
  await recordMoney(tx, {
    organizationId: e.organizationId,
    branchId: e.branchId,
    moneyAccountId: input.moneyAccountId,
    date: istDateOnly(input.paidAt),
    direction: "IN",
    amount: input.amount,
    source: "FEE_PAYMENT",
    refType: "FeePayment",
    refId: pay.id,
    narration: `Fee · ${e.student.name} (${e.student.studentCode}) · ${receiptNo}`,
    createdById: ctx.user.id,
  });
  await writeAudit(tx, ctx.actor, {
    action: "CREATE",
    entityType: "FeePayment",
    entityId: pay.id,
    branchId: e.branchId,
    after: pay,
  });
  return pay;
}

// ---------------------------------------------------------------- admission

export async function admit(ctx: ActionContext, input: z.output<typeof admissionSchema>) {
  const orgId = ctx.user.organizationId;
  if (!canAccessBranch(ctx.user.access, "students.create", input.branchId))
    throw new ActionError("You can't admit students in this branch.");
  const discountPaise = rupeesToPaise(input.discountAmount ?? 0);
  if (discountPaise > 0 && !can(ctx.user.access, "fees.discount_request"))
    throw new ActionError("You can't give discounts.");

  return db.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: orgId, deletedAt: null } });
    if (!branch || !["INSTITUTE", "BOTH"].includes(branch.kind))
      throw new ActionError("This branch doesn't run courses.");
    const course = await tx.course.findFirst({
      where: { id: input.courseId, organizationId: orgId, deletedAt: null, isActive: true },
    });
    if (!course) throw new ActionError("Course not found or not open for admissions.");
    if (input.batchId) {
      const batch = await tx.batch.findFirst({
        where: {
          id: input.batchId,
          organizationId: orgId,
          deletedAt: null,
          courseId: course.id,
          branchId: input.branchId,
          status: { in: ["PLANNED", "ONGOING"] },
        },
        include: { _count: { select: { enrollments: { where: { status: "ACTIVE", deletedAt: null } } } } },
      });
      if (!batch) throw new ActionError("Pick a planned or ongoing batch of this course in this branch.");
      if (batch._count.enrollments >= batch.capacity) throw new ActionError(`${batch.name} is full.`);
    }

    const feePaise = rupeesToPaise(course.fee);
    if (discountPaise > feePaise) throw new ActionError("The discount can't be more than the fee.");
    const autoApprove = discountPaise > 0 && !needsApproval(ctx.user.access, feePaise, discountPaise);
    const netPaise = feePaise - (autoApprove ? discountPaise : 0);
    const schedule = input.schedule.map((s) => ({
      label: s.label,
      amount: rupeesToPaise(s.amount),
      dueDate: dateOnly(s.dueDate),
    }));
    const problem = validateSchedule(schedule, netPaise);
    if (problem) throw new ActionError(problem);

    // Student: existing (second course) or new.
    let student = input.studentId
      ? await tx.student.findFirst({ where: { id: input.studentId, organizationId: orgId, deletedAt: null } })
      : null;
    if (input.studentId && !student) throw new ActionError("Student not found.");
    const details = { ...input.student, dob: input.student.dob ? dateOnly(input.student.dob) : null };
    if (!student) {
      const studentCode = await nextDocNumber(tx, {
        branchId: input.branchId,
        docType: "STUDENT_ID",
        date: dateOnly(input.enrolledAt),
      });
      student = await tx.student.create({
        data: { ...details, organizationId: orgId, branchId: input.branchId, studentCode },
      });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "Student",
        entityId: student.id,
        branchId: input.branchId,
        after: student,
      });
    } else {
      const active = await tx.enrollment.count({
        where: { studentId: student.id, courseId: course.id, status: { in: ["ACTIVE", "ON_HOLD"] }, deletedAt: null },
      });
      if (active > 0) throw new ActionError("This student is already enrolled in this course.");
      student = await tx.student.update({ where: { id: student.id }, data: details });
    }

    const enrollment = await tx.enrollment.create({
      data: {
        organizationId: orgId,
        branchId: input.branchId,
        studentId: student.id,
        courseId: course.id,
        batchId: input.batchId,
        enrolledAt: dateOnly(input.enrolledAt),
        courseFee: course.fee,
        discountAmount: toDec(autoApprove ? discountPaise : 0),
        netFee: toDec(netPaise),
        gstMode: course.gstMode,
        taxRate: 0,
        installments: {
          create: schedule.map((s, i) => ({
            sequence: i + 1,
            label: s.label,
            dueDate: s.dueDate,
            amount: toDec(s.amount),
          })),
        },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Enrollment",
      entityId: enrollment.id,
      branchId: input.branchId,
      after: enrollment,
    });

    await convertLeadOnCreate(tx, ctx, {
      type: "COURSE",
      phone: student.phone,
      leadId: can(ctx.user.access, "leads.convert") ? input.leadId : null,
      enrollmentId: enrollment.id,
      studentId: student.id,
      label: `Admitted to ${course.name} (${student.studentCode})`,
    });

    if (discountPaise > 0) {
      const req = await tx.discountRequest.create({
        data: {
          organizationId: orgId,
          branchId: input.branchId,
          enrollmentId: enrollment.id,
          amount: toDec(discountPaise),
          reason: input.discountReason ?? "",
          status: autoApprove ? "APPROVED" : "PENDING",
          requestedById: ctx.user.id,
          ...(autoApprove
            ? { decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: "Within the user's discount limit" }
            : {}),
        },
      });
      await writeAudit(tx, ctx.actor, {
        action: autoApprove ? "APPROVE" : "CREATE",
        entityType: "DiscountRequest",
        entityId: req.id,
        branchId: input.branchId,
        after: req,
      });
    }

    if ((input.payment.amount ?? 0) > 0) {
      await collectTx(tx, ctx, enrollment.id, {
        amount: input.payment.amount!,
        paymentModeId: input.payment.paymentModeId!,
        moneyAccountId: input.payment.moneyAccountId!,
        reference: input.payment.reference,
        paidAt: new Date(),
      });
    }
    return { studentId: student.id, enrollmentId: enrollment.id, discountPending: discountPaise > 0 && !autoApprove };
  });
}

export async function updateStudent(ctx: ActionContext, input: z.output<typeof updateStudentSchema>) {
  await db.$transaction(async (tx) => {
    const before = await tx.student.findFirst({
      where: { id: input.id, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!before) throw new ActionError("Student not found.");
    if (!canAccessBranch(ctx.user.access, "students.update", before.branchId))
      throw new ActionError("Not your branch.");
    const { id, ...data } = input;
    const after = await tx.student.update({
      where: { id },
      data: { ...data, dob: data.dob ? dateOnly(data.dob) : null },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Student",
      entityId: id,
      branchId: before.branchId,
      before,
      after,
    });
  });
}

// ---------------------------------------------------------------- fees

export async function collectFee(ctx: ActionContext, input: z.output<typeof collectFeeSchema>) {
  return db.$transaction(async (tx) => {
    const e = await loadEnrollment(tx, ctx, input.enrollmentId, "fees.collect");
    // Today: the real time. A back-dated receipt: noon IST that day (keeps receipts in order).
    const today = istDateOnly(new Date()).toISOString().slice(0, 10);
    if (input.paidAt > today) throw new ActionError("The payment date can't be in the future.");
    const paidAt = input.paidAt === today ? new Date() : new Date(`${input.paidAt}T06:30:00.000Z`);
    const pay = await collectTx(tx, ctx, e.id, { ...input, paidAt });
    return { id: pay.id, receiptNo: pay.receiptNo };
  });
}

/** Cancel a wrong receipt: undo its allocations and reverse the day-book entry. */
export async function cancelReceipt(ctx: ActionContext, input: z.output<typeof cancelReceiptSchema>) {
  await db.$transaction(async (tx) => {
    const pay = await tx.feePayment.findFirst({
      where: { id: input.paymentId, organizationId: ctx.user.organizationId },
      include: { allocations: { include: { installment: true } }, enrollment: { include: { student: true } } },
    });
    if (!pay) throw new ActionError("Receipt not found.");
    if (pay.cancelledAt) throw new ActionError("This receipt is already cancelled.");
    if (!canAccessBranch(ctx.user.access, "fees.cancel_receipt", pay.branchId))
      throw new ActionError("Not your branch.");
    const remaining = (await netReceived(tx, pay.enrollmentId)) - rupeesToPaise(pay.amount);
    if (remaining < 0) throw new ActionError("Money from this receipt has already been refunded.");
    for (const a of pay.allocations) {
      const paid = rupeesToPaise(a.installment.paidAmount) - rupeesToPaise(a.amount);
      await tx.feeInstallment.update({
        where: { id: a.installmentId },
        data: {
          paidAmount: toDec(paid),
          status: a.installment.status === "WAIVED" ? "WAIVED" : statusAfter(rupeesToPaise(a.installment.amount), paid),
        },
      });
    }
    await tx.feePayment.update({
      where: { id: pay.id },
      data: { cancelledAt: new Date(), cancelReason: input.reason },
    });
    await recordMoney(tx, {
      organizationId: pay.organizationId,
      branchId: pay.branchId,
      moneyAccountId: pay.moneyAccountId,
      date: istDateOnly(new Date()),
      direction: "OUT",
      amount: Number(pay.amount),
      source: "ADJUSTMENT",
      refType: "FeePayment",
      refId: pay.id,
      narration: `Receipt ${pay.receiptNo} cancelled: ${input.reason}`,
      createdById: ctx.user.id,
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "FeePayment",
      entityId: pay.id,
      branchId: pay.branchId,
      before: { cancelled: false },
      after: { cancelled: true, reason: input.reason },
    });
  });
}

export async function requestDiscount(ctx: ActionContext, input: z.output<typeof discountRequestSchema>) {
  return db.$transaction(async (tx) => {
    const e = await loadEnrollment(tx, ctx, input.enrollmentId, "fees.discount_request");
    if (e.status !== "ACTIVE" && e.status !== "ON_HOLD")
      throw new ActionError("Discounts can only be given on active enrollments.");
    const paise = rupeesToPaise(input.amount);
    if (paise > totalDue(asInstalments(e.installments)))
      throw new ActionError("The discount is more than the fee still due.");
    const pending = await tx.discountRequest.count({ where: { enrollmentId: e.id, status: "PENDING" } });
    if (pending) throw new ActionError("A discount request is already waiting for approval.");
    const total = rupeesToPaise(e.discountAmount) + paise;
    const auto = !needsApproval(ctx.user.access, rupeesToPaise(e.courseFee), total);
    const req = await tx.discountRequest.create({
      data: {
        organizationId: e.organizationId,
        branchId: e.branchId,
        enrollmentId: e.id,
        amount: toDec(paise),
        reason: input.reason,
        status: auto ? "APPROVED" : "PENDING",
        requestedById: ctx.user.id,
        ...(auto
          ? { decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: "Within the user's discount limit" }
          : {}),
      },
    });
    if (auto) await applyApprovedDiscount(tx, e.id, paise);
    await writeAudit(tx, ctx.actor, {
      action: auto ? "APPROVE" : "CREATE",
      entityType: "DiscountRequest",
      entityId: req.id,
      branchId: e.branchId,
      after: req,
    });
    return { approved: auto };
  });
}

/** Approvers can't approve their own request, and only within their own discount limit. */
export async function decideDiscount(ctx: ActionContext, input: z.output<typeof decisionSchema>) {
  await db.$transaction(async (tx) => {
    const req = await tx.discountRequest.findFirst({
      where: { id: input.id, organizationId: ctx.user.organizationId },
      include: { enrollment: true },
    });
    if (!req || req.status !== "PENDING") throw new ActionError("This request is no longer pending.");
    if (!canAccessBranch(ctx.user.access, "fees.discount_approve", req.branchId))
      throw new ActionError("Not your branch.");
    if (req.requestedById === ctx.user.id) throw new ActionError("You can't approve your own request.");
    if (input.approve) {
      const total = rupeesToPaise(req.enrollment.discountAmount) + rupeesToPaise(req.amount);
      if (needsApproval(ctx.user.access, rupeesToPaise(req.enrollment.courseFee), total)) {
        throw new ActionError("This discount is above your own limit. Someone with a higher limit must approve it.");
      }
      await applyApprovedDiscount(tx, req.enrollmentId, rupeesToPaise(req.amount));
    }
    await tx.discountRequest.update({
      where: { id: req.id },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED",
        decidedById: ctx.user.id,
        decidedAt: new Date(),
        decisionNote: input.note,
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: input.approve ? "APPROVE" : "REJECT",
      entityType: "DiscountRequest",
      entityId: req.id,
      branchId: req.branchId,
      after: { amount: req.amount, note: input.note },
    });
  });
}

export async function waiveInstalment(ctx: ActionContext, input: z.output<typeof waiveSchema>) {
  await db.$transaction(async (tx) => {
    const inst = await tx.feeInstallment.findFirst({
      where: { id: input.instalmentId, enrollment: { organizationId: ctx.user.organizationId } },
      include: { enrollment: true },
    });
    if (!inst) throw new ActionError("Instalment not found.");
    if (!canAccessBranch(ctx.user.access, "fees.waive", inst.enrollment.branchId))
      throw new ActionError("Not your branch.");
    if (inst.status === "PAID" || inst.status === "WAIVED") throw new ActionError("Nothing is due on this instalment.");
    await tx.feeInstallment.update({ where: { id: inst.id }, data: { status: "WAIVED", waivedReason: input.reason } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "FeeInstallment",
      entityId: inst.id,
      branchId: inst.enrollment.branchId,
      before: { status: inst.status },
      after: { status: "WAIVED", reason: input.reason, waived: Number(inst.amount) - Number(inst.paidAmount) },
    });
  });
}

// ---------------------------------------------------------------- refunds

export async function requestRefund(ctx: ActionContext, input: z.output<typeof refundRequestSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadEnrollment(tx, ctx, input.enrollmentId, "fees.refund_request");
    const pending = await tx.feeRefund.findMany({
      where: { enrollmentId: e.id, OR: [{ status: "PENDING" }, { status: "APPROVED", paidAt: null }] },
    });
    const available = (await netReceived(tx, e.id)) - pending.reduce((a, r) => a + rupeesToPaise(r.amount), 0);
    if (rupeesToPaise(input.amount) > available) {
      throw new ActionError(
        available > 0 ? `At most ₹${(available / 100).toFixed(2)} can be refunded.` : "There's nothing to refund.",
      );
    }
    const r = await tx.feeRefund.create({
      data: {
        organizationId: e.organizationId,
        branchId: e.branchId,
        enrollmentId: e.id,
        amount: toDec(rupeesToPaise(input.amount)),
        reason: input.reason,
        requestedById: ctx.user.id,
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "FeeRefund",
      entityId: r.id,
      branchId: e.branchId,
      after: r,
    });
  });
}

export async function decideRefund(ctx: ActionContext, input: z.output<typeof decisionSchema>) {
  await db.$transaction(async (tx) => {
    const r = await tx.feeRefund.findFirst({ where: { id: input.id, organizationId: ctx.user.organizationId } });
    if (!r || r.status !== "PENDING") throw new ActionError("This refund is no longer pending.");
    if (!canAccessBranch(ctx.user.access, "fees.refund_approve", r.branchId)) throw new ActionError("Not your branch.");
    if (r.requestedById === ctx.user.id) throw new ActionError("You can't approve your own request.");
    await tx.feeRefund.update({
      where: { id: r.id },
      data: { status: input.approve ? "APPROVED" : "REJECTED", approvedById: ctx.user.id, approvedAt: new Date() },
    });
    await writeAudit(tx, ctx.actor, {
      action: input.approve ? "APPROVE" : "REJECT",
      entityType: "FeeRefund",
      entityId: r.id,
      branchId: r.branchId,
      after: { note: input.note },
    });
  });
}

export async function payRefund(ctx: ActionContext, input: z.output<typeof payRefundSchema>) {
  await db.$transaction(async (tx) => {
    const r = await tx.feeRefund.findFirst({
      where: { id: input.id, organizationId: ctx.user.organizationId },
      include: { enrollment: { include: { student: true } } },
    });
    if (!r || r.status !== "APPROVED" || r.paidAt)
      throw new ActionError("Only an approved, unpaid refund can be paid.");
    if (!canAccessBranch(ctx.user.access, "fees.collect", r.branchId)) throw new ActionError("Not your branch.");
    await assertPaymentMode(tx, ctx.user.organizationId, input.paymentModeId, "refund");
    await assertMoneyAccount(tx, input.moneyAccountId, r.branchId);
    const now = new Date();
    await tx.feeRefund.update({
      where: { id: r.id },
      data: { paidAt: now, paymentModeId: input.paymentModeId, moneyAccountId: input.moneyAccountId },
    });
    await recordMoney(tx, {
      organizationId: r.organizationId,
      branchId: r.branchId,
      moneyAccountId: input.moneyAccountId,
      date: istDateOnly(now),
      direction: "OUT",
      amount: Number(r.amount),
      source: "FEE_REFUND",
      refType: "FeeRefund",
      refId: r.id,
      narration: `Fee refund · ${r.enrollment.student.name} (${r.enrollment.student.studentCode})`,
      createdById: ctx.user.id,
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "FeeRefund",
      entityId: r.id,
      branchId: r.branchId,
      before: { paid: false },
      after: { paid: true },
    });
  });
}

// ---------------------------------------------------------------- transfer / drop / complete

/** Branch or batch transfer. Dues still to be paid move with the student to the new branch. */
export async function transferEnrollment(ctx: ActionContext, input: z.output<typeof transferSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadEnrollment(tx, ctx, input.enrollmentId, "students.transfer");
    if (e.status !== "ACTIVE" && e.status !== "ON_HOLD")
      throw new ActionError("Only active students can be transferred.");
    const to = await tx.branch.findFirst({
      where: {
        id: input.toBranchId,
        organizationId: e.organizationId,
        deletedAt: null,
        kind: { in: ["INSTITUTE", "BOTH"] },
      },
    });
    if (!to) throw new ActionError("Pick a branch that runs courses.");
    if (input.toBatchId) {
      const b = await tx.batch.findFirst({
        where: {
          id: input.toBatchId,
          branchId: to.id,
          courseId: e.courseId,
          deletedAt: null,
          status: { in: ["PLANNED", "ONGOING"] },
        },
        include: { _count: { select: { enrollments: { where: { status: "ACTIVE", deletedAt: null } } } } },
      });
      if (!b) throw new ActionError("Pick a batch of the same course in that branch.");
      if (b._count.enrollments >= b.capacity && b.id !== e.batchId) throw new ActionError(`${b.name} is full.`);
    }
    if (to.id === e.branchId && input.toBatchId === e.batchId) throw new ActionError("Nothing changes.");
    await tx.enrollmentTransfer.create({
      data: {
        enrollmentId: e.id,
        fromBranchId: e.branchId,
        toBranchId: to.id,
        fromBatchId: e.batchId,
        toBatchId: input.toBatchId,
        reason: input.reason,
        transferredById: ctx.user.id,
      },
    });
    await tx.enrollment.update({ where: { id: e.id }, data: { branchId: to.id, batchId: input.toBatchId } });
    if (to.id !== e.branchId) await tx.student.update({ where: { id: e.studentId }, data: { branchId: to.id } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Enrollment",
      entityId: e.id,
      branchId: to.id,
      before: { branchId: e.branchId, batchId: e.batchId },
      after: { branchId: to.id, batchId: input.toBatchId, reason: input.reason },
    });
  });
}

/** Drop out: every unpaid instalment is waived. Refunds of money already paid go through approval. */
export async function dropEnrollment(ctx: ActionContext, input: z.output<typeof dropSchema>) {
  await db.$transaction(async (tx) => {
    const e = await loadEnrollment(tx, ctx, input.enrollmentId, "students.update");
    if (e.status === "DROPPED" || e.status === "COMPLETED") throw new ActionError("This enrollment is already closed.");
    const waived = e.installments.filter((i) => i.status === "DUE" || i.status === "PARTIAL");
    await tx.feeInstallment.updateMany({
      where: { id: { in: waived.map((i) => i.id) } },
      data: { status: "WAIVED", waivedReason: "Dropped out" },
    });
    await tx.enrollment.update({
      where: { id: e.id },
      data: { status: "DROPPED", droppedAt: new Date(), dropReason: input.reason },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Enrollment",
      entityId: e.id,
      branchId: e.branchId,
      before: { status: e.status },
      after: {
        status: "DROPPED",
        reason: input.reason,
        waived: waived.reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0),
      },
    });
  });
}

export async function completeEnrollment(ctx: ActionContext, enrollmentId: string) {
  await db.$transaction(async (tx) => {
    const e = await loadEnrollment(tx, ctx, enrollmentId, "students.update");
    if (e.status !== "ACTIVE" && e.status !== "ON_HOLD")
      throw new ActionError("Only active enrollments can be completed.");
    await tx.enrollment.update({ where: { id: e.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Enrollment",
      entityId: e.id,
      branchId: e.branchId,
      before: { status: e.status },
      after: { status: "COMPLETED" },
    });
  });
  revalidateSite(); // placement % on the website counts completed students
}

// ---------------------------------------------------------------- attendance

/** Trainers (OWN scope) can only mark their own batches. One session per batch per day; re-saving updates it. */
export async function saveAttendance(ctx: ActionContext, input: z.output<typeof attendanceSchema>) {
  await db.$transaction(async (tx) => {
    const batch = await tx.batch.findFirst({
      where: { id: input.batchId, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!batch) throw new ActionError("Batch not found.");
    if (!canAccessBranch(ctx.user.access, "student_attendance.mark", batch.branchId))
      throw new ActionError("Not your branch.");
    if (scopeOf(ctx.user.access, "student_attendance.mark") === "OWN" && batch.trainerId !== ctx.user.id) {
      throw new ActionError("You can only mark attendance for your own batches.");
    }
    const date = dateOnly(input.date);
    if (date.getTime() > istDateOnly(new Date()).getTime())
      throw new ActionError("Attendance can't be marked for a future date.");
    const enrollments = await tx.enrollment.findMany({
      where: { batchId: batch.id, deletedAt: null },
      select: { id: true },
    });
    const valid = new Set(enrollments.map((e) => e.id));
    if (input.records.some((r) => !valid.has(r.enrollmentId)))
      throw new ActionError("A student in the list isn't in this batch.");

    const session = await tx.batchSession.upsert({
      where: { batchId_date: { batchId: batch.id, date } },
      create: { batchId: batch.id, date, topic: input.topic, takenById: ctx.user.id },
      update: { topic: input.topic, takenById: ctx.user.id },
    });
    for (const r of input.records) {
      await tx.studentAttendance.upsert({
        where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: r.enrollmentId } },
        create: { sessionId: session.id, enrollmentId: r.enrollmentId, status: r.status },
        update: { status: r.status },
      });
    }
    if (batch.status === "PLANNED") await tx.batch.update({ where: { id: batch.id }, data: { status: "ONGOING" } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "BatchSession",
      entityId: session.id,
      branchId: batch.branchId,
      after: {
        date: input.date,
        present: input.records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length,
        total: input.records.length,
      },
    });
  });
}
