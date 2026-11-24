"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { indianPhone } from "@/lib/format";
import { defineAction } from "@/modules/rbac/action";
import { findComebackCandidates, lookupCustomerByPhone } from "./jobs.queries";
import { returnJob, takeJob } from "./shelf.service";
import {
  addLabour,
  addNote,
  assignJob,
  cancelInvoice,
  cancelJob,
  changeStatus,
  createInvoice,
  deliver,
  intake,
  issuePart,
  recordPayment,
  recordQuoteDecision,
  rejectPartRequest,
  removeLabour,
  requestPart,
  returnPart,
  revealUnlockCode,
  sendQuote,
  setPartFree,
  setWarrantyPartsFree,
} from "./jobs.service";
import {
  assignSchema,
  cancelInvoiceSchema,
  cancelJobSchema,
  deliverSchema,
  freePartSchema,
  intakeSchema,
  issuePartSchema,
  jobIdSchema,
  labourSchema,
  noteSchema,
  partRequestSchema,
  paymentSchema,
  quoteDecisionSchema,
  quoteSchema,
  rejectRequestSchema,
  removeLineSchema,
  returnPartSchema,
  statusChangeSchema,
  warrantyPartsFreeSchema,
} from "./service.schemas";

export const intakeAction = defineAction(
  { permission: "jobcards.create", schema: intakeSchema },
  async (input, ctx) => {
    const job = await intake(ctx, input);
    redirect(`/admin/service/jobs/${job.id}?created=1`);
  },
);

export const lookupCustomerAction = defineAction(
  { permission: "jobcards.create", schema: z.object({ phone: indianPhone }) },
  async ({ phone }, ctx) => lookupCustomerByPhone(ctx.user, phone),
);

export const comebackCheckAction = defineAction(
  {
    permission: "jobcards.create",
    schema: z.object({
      deviceId: z.string().optional().nullable(),
      imei: z.string().optional().nullable(),
      serialNo: z.string().optional().nullable(),
    }),
  },
  async (input, ctx) => findComebackCandidates(ctx.user, input),
);

const done = <T>(r: T) => {
  refresh();
  return r;
};

export const changeStatusAction = defineAction(
  { permission: "jobcards.change_status", schema: statusChangeSchema },
  async (i, ctx) => done(await changeStatus(ctx, i)),
);
export const assignJobAction = defineAction({ permission: "jobcards.assign", schema: assignSchema }, async (i, ctx) =>
  done(await assignJob(ctx, i)),
);
export const addNoteAction = defineAction({ permission: "jobcards.view", schema: noteSchema }, async (i, ctx) =>
  done(await addNote(ctx, i)),
);
export const addLabourAction = defineAction({ permission: "jobcards.update", schema: labourSchema }, async (i, ctx) =>
  done(await addLabour(ctx, i)),
);
export const removeLabourAction = defineAction(
  { permission: "jobcards.update", schema: removeLineSchema },
  async (i, ctx) => done(await removeLabour(ctx, i)),
);
export const requestPartAction = defineAction(
  { permission: "part_requests.create", schema: partRequestSchema },
  async (i, ctx) => done(await requestPart(ctx, i)),
);
export const issuePartAction = defineAction(
  { permission: "part_requests.issue", schema: issuePartSchema },
  async (i, ctx) => done(await issuePart(ctx, i)),
);
export const returnPartAction = defineAction(
  { permission: "part_requests.issue", schema: returnPartSchema },
  async (i, ctx) => done(await returnPart(ctx, i)),
);
export const rejectPartRequestAction = defineAction(
  { permission: "part_requests.issue", schema: rejectRequestSchema },
  async (i, ctx) => done(await rejectPartRequest(ctx, i.requestId, i.note)),
);
export const setWarrantyPartsFreeAction = defineAction(
  { permission: "jobcards.warranty_decide", schema: warrantyPartsFreeSchema },
  async (i, ctx) => done(await setWarrantyPartsFree(ctx, i)),
);
export const setPartFreeAction = defineAction(
  { permission: "jobcards.warranty_decide", schema: freePartSchema },
  async (i, ctx) => done(await setPartFree(ctx, i)),
);
export const sendQuoteAction = defineAction({ permission: "quotations.create", schema: quoteSchema }, async (i, ctx) =>
  done(await sendQuote(ctx, i)),
);
export const quoteDecisionAction = defineAction(
  { permission: "quotations.record_decision", schema: quoteDecisionSchema },
  async (i, ctx) => done(await recordQuoteDecision(ctx, i)),
);
export const recordPaymentAction = defineAction({ permission: null, schema: paymentSchema }, async (i, ctx) =>
  done(await recordPayment(ctx, i)),
);
export const createInvoiceAction = defineAction(
  { permission: "invoices.create", schema: jobIdSchema },
  async (i, ctx) => done(await createInvoice(ctx, i.jobId)),
);
export const cancelInvoiceAction = defineAction(
  { permission: "invoices.cancel", schema: cancelInvoiceSchema },
  async (i, ctx) => done(await cancelInvoice(ctx, i.invoiceId, i.reason)),
);
export const deliverAction = defineAction({ permission: "jobcards.deliver", schema: deliverSchema }, async (i, ctx) =>
  done(await deliver(ctx, i)),
);
export const cancelJobAction = defineAction(
  { permission: "jobcards.cancel", schema: cancelJobSchema },
  async (i, ctx) => done(await cancelJob(ctx, i)),
);
export const revealUnlockAction = defineAction({ permission: null, schema: jobIdSchema }, async (i, ctx) =>
  revealUnlockCode(ctx, i.jobId),
);

/** Condition photos (FormData: jobId, file). Private files, linked to the job card. */
export async function uploadJobPhotoAction(formData: FormData) {
  const { getCurrentUser, getRequestMeta } = await import("@/modules/auth/current");
  const { saveUpload, IMAGE_TYPES } = await import("@/modules/files/files.service");
  const { db } = await import("@/lib/db");
  const { canAccessBranch } = await import("@/modules/rbac/access");
  const { ActionError } = await import("@/modules/rbac/action");
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Your session has expired. Please sign in again." };
    const jobId = String(formData.get("jobId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Choose a photo." };
    const job = await db.jobCard.findFirst({
      where: { id: jobId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!job || !canAccessBranch(user.access, "jobcards.update", job.branchId)) {
      return { ok: false as const, error: "You can't add photos to this job." };
    }
    const asset = await saveUpload(
      { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) },
      file,
      { allowed: IMAGE_TYPES, maxBytes: 8 * 1024 * 1024, isPublic: false, folder: "job-photos" },
    );
    await db.attachment.create({
      data: { fileId: asset.id, entityType: "JobCard", entityId: job.id, label: "Condition photo" },
    });
    refresh();
    return { ok: true as const, data: { id: asset.id } };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false as const, error: e.message };
    console.error("[uploadJobPhoto]", e);
    return { ok: false as const, error: "Upload failed. Please try again." };
  }
}

// ---------------------------------------------------------------- the shelf (engineers take / return jobs)

export const takeJobAction = defineAction(
  { permission: "jobcards.self_assign", schema: z.object({ id: z.string().min(1) }) },
  async (i, ctx) => done(await takeJob(ctx, i.id)),
);
export const returnJobAction = defineAction(
  {
    permission: "jobcards.self_assign",
    schema: z.object({
      id: z.string().min(1),
      reason: z
        .string()
        .trim()
        .max(200)
        .optional()
        .nullable()
        .transform((v) => v || null),
    }),
  },
  async (i, ctx) => {
    // The job is no longer theirs, so they can't stay on its page: go to the shelf with a confirmation.
    const jobNo = await returnJob(ctx, i.id, i.reason);
    redirect(`/admin/service/shelf?returned=${encodeURIComponent(jobNo)}`);
  },
);
