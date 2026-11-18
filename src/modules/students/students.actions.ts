"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { indianPhone } from "@/lib/format";
import { defineAction } from "@/modules/rbac/action";
import { findStudentByPhone } from "./students.queries";
import {
  attendanceSchema,
  admissionSchema,
  cancelReceiptSchema,
  collectFeeSchema,
  completeSchema,
  decisionSchema,
  discountRequestSchema,
  dropSchema,
  payRefundSchema,
  refundRequestSchema,
  transferSchema,
  updateStudentSchema,
  waiveSchema,
} from "./students.schemas";
import {
  admit,
  cancelReceipt,
  collectFee,
  completeEnrollment,
  decideDiscount,
  decideRefund,
  dropEnrollment,
  payRefund,
  requestDiscount,
  requestRefund,
  saveAttendance,
  transferEnrollment,
  updateStudent,
  waiveInstalment,
} from "./students.service";

const done = <T>(r: T) => {
  refresh();
  return r;
};

export const admitAction = defineAction(
  { permission: "students.create", schema: admissionSchema },
  async (input, ctx) => {
    const r = await admit(ctx, input);
    redirect(`/admin/students/${r.studentId}?admitted=1${r.discountPending ? "&discount=pending" : ""}`);
  },
);

export const findStudentAction = defineAction(
  { permission: "students.create", schema: z.object({ phone: indianPhone }) },
  async ({ phone }, ctx) => findStudentByPhone(ctx.user, phone),
);

export const updateStudentAction = defineAction(
  { permission: "students.update", schema: updateStudentSchema },
  async (i, ctx) => done(await updateStudent(ctx, i)),
);
export const collectFeeAction = defineAction({ permission: "fees.collect", schema: collectFeeSchema }, async (i, ctx) =>
  done(await collectFee(ctx, i)),
);
export const cancelReceiptAction = defineAction(
  { permission: "fees.cancel_receipt", schema: cancelReceiptSchema },
  async (i, ctx) => done(await cancelReceipt(ctx, i)),
);
export const requestDiscountAction = defineAction(
  { permission: "fees.discount_request", schema: discountRequestSchema },
  async (i, ctx) => done(await requestDiscount(ctx, i)),
);
export const decideDiscountAction = defineAction(
  { permission: "fees.discount_approve", schema: decisionSchema },
  async (i, ctx) => done(await decideDiscount(ctx, i)),
);
export const waiveInstalmentAction = defineAction({ permission: "fees.waive", schema: waiveSchema }, async (i, ctx) =>
  done(await waiveInstalment(ctx, i)),
);
export const requestRefundAction = defineAction(
  { permission: "fees.refund_request", schema: refundRequestSchema },
  async (i, ctx) => done(await requestRefund(ctx, i)),
);
export const decideRefundAction = defineAction(
  { permission: "fees.refund_approve", schema: decisionSchema },
  async (i, ctx) => done(await decideRefund(ctx, i)),
);
export const payRefundAction = defineAction({ permission: "fees.collect", schema: payRefundSchema }, async (i, ctx) =>
  done(await payRefund(ctx, i)),
);
export const transferAction = defineAction(
  { permission: "students.transfer", schema: transferSchema },
  async (i, ctx) => done(await transferEnrollment(ctx, i)),
);
export const dropAction = defineAction({ permission: "students.update", schema: dropSchema }, async (i, ctx) =>
  done(await dropEnrollment(ctx, i)),
);
export const completeAction = defineAction({ permission: "students.update", schema: completeSchema }, async (i, ctx) =>
  done(await completeEnrollment(ctx, i.enrollmentId)),
);
export const saveAttendanceAction = defineAction(
  { permission: "student_attendance.mark", schema: attendanceSchema },
  async (i, ctx) => done(await saveAttendance(ctx, i)),
);
