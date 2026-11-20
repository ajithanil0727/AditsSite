import "server-only";
import type { z } from "zod";
import type { JobStatusKey } from "@/generated/prisma/enums";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, type Tx } from "@/lib/db";
import { addDays, istDateOnly } from "@/lib/fy";
import { assertMoneyAccount, assertPaymentMode, recordMoney } from "@/modules/accounts/money.service";
import { writeAudit } from "@/modules/audit/audit.service";
import { issueStock, receiveStock } from "@/modules/inventory/stock.service";
import { convertLeadOnCreate } from "@/modules/leads/leads.service";
import { nextDocNumber } from "@/modules/numbering/numbering.service";
import { can, canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import type { PermissionKey } from "@/lib/permissions";
import { computeInvoice, isInterState, paiseToDecimalString, rupeesToPaise } from "@/modules/tax/gst";
import { DEFAULT_SERVICE_GST, buildChargeLines, chargesTotalPaise, type ChargeLine } from "./charges";
import type {
  assignSchema,
  cancelJobSchema,
  deliverSchema,
  freePartSchema,
  intakeSchema,
  issuePartSchema,
  labourSchema,
  noteSchema,
  partRequestSchema,
  paymentSchema,
  quoteDecisionSchema,
  quoteSchema,
  removeLineSchema,
  returnPartSchema,
  statusChangeSchema,
  warrantyPartsFreeSchema,
} from "./service.schemas";
import {
  chargesEditable,
  manualTargets,
  OPEN_KEYS,
  pickWarrantyDays,
  repairAllowed,
  turnaroundMinutes,
  underWarranty,
} from "./workflow";

type Job = Awaited<ReturnType<typeof loadJob>>;

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- helpers

/** Load a job and check branch scope + "own records" for the permission. */
async function loadJob(tx: Tx, ctx: ActionContext, jobId: string, permission: PermissionKey) {
  const job = await tx.jobCard.findFirst({
    where: { id: jobId, organizationId: ctx.user.organizationId, deletedAt: null },
    include: {
      status: true,
      customer: true,
      device: true,
      branch: {
        select: { id: true, code: true, gstRegistrationId: true, gstRegistration: { select: { stateCode: true } } },
      },
    },
  });
  if (!job) throw new ActionError("Job card not found.");
  if (!canAccessBranch(ctx.user.access, permission, job.branchId))
    throw new ActionError("This job belongs to a branch you can't access.");
  if (scopeOf(ctx.user.access, permission) === "OWN" && job.assignedEngineerId !== ctx.user.id) {
    throw new ActionError("This job isn't assigned to you.");
  }
  return job;
}

async function statusFor(tx: Tx, organizationId: string, key: JobStatusKey) {
  const st = await tx.jobStatus.findFirst({
    where: { organizationId, systemKey: key, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (!st)
    throw new ActionError(
      `No active status is set up for the ${key.replace("_", " ")} stage (Master data → Job card statuses).`,
    );
  return st;
}

async function moveTo(
  tx: Tx,
  ctx: ActionContext,
  job: Job,
  key: JobStatusKey,
  note?: string | null,
  statusId?: string,
) {
  const to = statusId
    ? await tx.jobStatus.findUniqueOrThrow({ where: { id: statusId } })
    : await statusFor(tx, job.organizationId, key);
  await tx.jobCard.update({
    where: { id: job.id },
    data: { statusId: to.id, ...(key === "READY" ? { readyAt: new Date() } : {}) },
  });
  await tx.jobStatusHistory.create({
    data: {
      jobCardId: job.id,
      fromStatusId: job.statusId,
      toStatusId: to.id,
      changedById: ctx.user.id,
      note: note ?? null,
    },
  });
  await writeAudit(tx, ctx.actor, {
    action: "UPDATE",
    entityType: "JobCard",
    entityId: job.id,
    branchId: job.branchId,
    before: { status: job.status.name },
    after: { status: to.name, ...(note ? { note } : {}) },
  });
  job.statusId = to.id;
  job.status = to;
}

function gstContext(job: Job) {
  return {
    registered: !!job.branch.gstRegistrationId,
    interState: isInterState(job.branch.gstRegistration?.stateCode, job.customer.gstin),
    pricesIncludeTax: true,
  };
}

async function currentCharges(tx: Tx, job: Job): Promise<ChargeLine[]> {
  const [parts, labour] = await Promise.all([
    tx.jobPart.findMany({
      where: { jobCardId: job.id },
      include: {
        part: { select: { name: true, hsnSac: { select: { code: true } }, taxRate: { select: { rate: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    tx.jobLabour.findMany({
      where: { jobCardId: job.id },
      include: { serviceRate: { select: { hsnSac: { select: { code: true } }, taxRate: { select: { rate: true } } } } },
    }),
  ]);
  return buildChargeLines({
    isWarrantyJob: job.isWarrantyJob,
    warrantyPartsFree: job.warrantyPartsFree,
    parts: parts.map((p) => ({
      id: p.id,
      partId: p.partId,
      description: p.part.name,
      qty: Number(p.qty),
      returnedQty: Number(p.returnedQty),
      unitPrice: Number(p.unitPrice),
      taxRate: p.part.taxRate ? Number(p.part.taxRate.rate) : DEFAULT_SERVICE_GST,
      hsn: p.part.hsnSac?.code ?? null,
      isFreeWarranty: p.isFreeWarranty,
    })),
    labour: labour.map((l) => ({
      id: l.id,
      description: l.description,
      amount: Number(l.amount),
      taxRate: l.serviceRate?.taxRate ? Number(l.serviceRate.taxRate.rate) : DEFAULT_SERVICE_GST,
      sac: l.serviceRate?.hsnSac?.code ?? null,
    })),
  });
}

async function issuedInvoice(tx: Tx, jobId: string) {
  return tx.invoice.findFirst({ where: { jobCardId: jobId, status: "ISSUED", kind: { not: "CREDIT_NOTE" } } });
}

/** Net money held for the job: advances + payments − refunds (rupees). */
async function netPaid(tx: Tx, jobId: string) {
  const rows = await tx.servicePayment.findMany({ where: { jobCardId: jobId }, select: { kind: true, amount: true } });
  return r2(rows.reduce((a, p) => a + (p.kind === "REFUND" ? -1 : 1) * Number(p.amount), 0));
}

function assertEditable(job: Job, hasInvoice: boolean) {
  if (!chargesEditable(job.status.systemKey, hasInvoice)) {
    throw new ActionError(
      hasInvoice
        ? "An invoice has been issued. Cancel it first to change parts or labour."
        : "Parts and labour are locked at this stage.",
    );
  }
}

async function assertEngineer(tx: Tx, organizationId: string, branchId: string, engineerId: string) {
  const eng = await tx.user.findFirst({
    where: { id: engineerId, organizationId, isActive: true, deletedAt: null, branches: { some: { branchId } } },
    select: { id: true },
  });
  if (!eng) throw new ActionError("That engineer isn't active in this branch.");
}

// ---------------------------------------------------------------- intake

export async function intake(ctx: ActionContext, input: z.output<typeof intakeSchema>) {
  const orgId = ctx.user.organizationId;
  if (!canAccessBranch(ctx.user.access, "jobcards.create", input.branchId)) {
    throw new ActionError("You can't take in devices for this branch.");
  }

  return db.$transaction(async (tx) => {
    // Customer: picked, or matched by phone, or new.
    let customer = input.customerId
      ? await tx.customer.findFirst({ where: { id: input.customerId, organizationId: orgId, deletedAt: null } })
      : await tx.customer.findFirst({ where: { organizationId: orgId, phone: input.customerPhone, deletedAt: null } });
    if (input.customerId && !customer) throw new ActionError("Customer not found.");
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          organizationId: orgId,
          branchId: input.branchId,
          name: input.customerName.trim(),
          phone: input.customerPhone,
          altPhone: input.customerAltPhone,
          email: input.customerEmail,
          address: input.customerAddress,
          gstin: input.customerGstin,
          stateCode: input.customerGstin?.slice(0, 2) ?? null,
        },
      });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "Customer",
        entityId: customer.id,
        branchId: input.branchId,
        after: customer,
      });
    } else if (input.customerGstin && input.customerGstin !== customer.gstin) {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: { gstin: input.customerGstin, stateCode: input.customerGstin.slice(0, 2) },
      });
    }

    // Device: picked from the customer's devices, or new.
    let device = input.deviceId
      ? await tx.device.findFirst({ where: { id: input.deviceId, customerId: customer.id } })
      : null;
    if (input.deviceId && !device) throw new ActionError("That device doesn't belong to this customer.");
    if (!device) {
      device = await tx.device.create({
        data: {
          organizationId: orgId,
          customerId: customer.id,
          deviceTypeId: input.deviceTypeId,
          brandId: input.brandId,
          modelId: input.modelId,
          modelText: input.modelText,
          imei: input.imei,
          serialNo: input.serialNo,
          color: input.color,
        },
      });
    }

    // Warranty comeback: the earlier job must be for the same device (or IMEI/serial) and still under warranty.
    let isWarrantyJob = false;
    if (input.parentJobId) {
      const parent = await tx.jobCard.findFirst({
        where: { id: input.parentJobId, organizationId: orgId },
        include: { device: true, status: { select: { systemKey: true } } },
      });
      const sameDevice =
        parent &&
        (parent.deviceId === device.id ||
          (!!device.imei && parent.device.imei === device.imei) ||
          (!!device.serialNo && parent.device.serialNo === device.serialNo));
      if (!parent || !sameDevice) throw new ActionError("The earlier job is for a different device.");
      isWarrantyJob = parent.status.systemKey === "DELIVERED" && underWarranty(parent.warrantyUntil, new Date());
    }

    if (input.assignedEngineerId) {
      if (!can(ctx.user.access, "jobcards.assign")) throw new ActionError("You can't assign engineers.");
      await assertEngineer(tx, orgId, input.branchId, input.assignedEngineerId);
    }

    const received = await statusFor(tx, orgId, "RECEIVED");
    const jobNo = await nextDocNumber(tx, { branchId: input.branchId, docType: "JOB_CARD" });
    const job = await tx.jobCard.create({
      data: {
        organizationId: orgId,
        branchId: input.branchId,
        jobNo,
        customerId: customer.id,
        deviceId: device.id,
        receivedById: ctx.user.id,
        problemReported: input.problemReported,
        problemCategoryId: input.problemCategoryId,
        accessories: input.accessories,
        conditionNotes: input.conditionNotes,
        unlockCodeEnc: input.unlockCode ? encryptSecret(input.unlockCode) : null,
        estimatedAt: input.estimatedAt ? new Date(`${input.estimatedAt}T12:30:00.000Z`) : null, // 6 PM IST
        estimatedCost: input.estimatedCost,
        priority: input.priority,
        assignedEngineerId: input.assignedEngineerId,
        parentJobId: input.parentJobId,
        isWarrantyJob,
        statusId: received.id,
      },
    });
    await tx.jobStatusHistory.create({
      data: { jobCardId: job.id, toStatusId: received.id, changedById: ctx.user.id, note: "Device received" },
    });
    const { unlockCodeEnc: _secret, ...auditable } = job;
    void _secret;
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "JobCard",
      entityId: job.id,
      branchId: job.branchId,
      after: auditable,
    });

    await convertLeadOnCreate(tx, ctx, {
      type: "SERVICE",
      phone: customer.phone,
      leadId: can(ctx.user.access, "leads.convert") ? input.leadId : null,
      jobCardId: job.id,
      customerId: customer.id,
      label: `Job card ${jobNo} opened`,
    });

    if (input.advanceAmount && input.advanceAmount > 0) {
      const loaded = await loadJob(tx, ctx, job.id, "jobcards.create");
      await recordPaymentTx(tx, ctx, loaded, {
        jobId: job.id,
        kind: "ADVANCE",
        amount: input.advanceAmount,
        paymentModeId: input.advanceModeId!,
        moneyAccountId: input.advanceAccountId!,
        reference: input.advanceReference,
      });
    }
    return { id: job.id, jobNo };
  });
}

// ---------------------------------------------------------------- status, assignment, notes

export async function changeStatus(ctx: ActionContext, input: z.output<typeof statusChangeSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.change_status");
    const target = await tx.jobStatus.findFirst({
      where: { id: input.statusId, organizationId: job.organizationId, isActive: true },
    });
    if (!target) throw new ActionError("Pick a valid status.");
    const from = job.status.systemKey;
    const to = target.systemKey;
    if (from !== to && !manualTargets(from).includes(to)) {
      throw new ActionError(`A job can't go from "${job.status.name}" to "${target.name}" directly.`);
    }
    if (to === "IN_REPAIR") {
      if (!job.assignedEngineerId) throw new ActionError("Assign an engineer before starting the repair.");
      const latest = await tx.quotation.findFirst({ where: { jobCardId: job.id }, orderBy: { version: "desc" } });
      const lines = await currentCharges(tx, job);
      const check = repairAllowed({
        estimatePaise: job.estimatedCost != null ? rupeesToPaise(job.estimatedCost) : null,
        chargesPaise: chargesTotalPaise(lines, gstContext(job)),
        latestQuote: latest ? { status: latest.status, totalPaise: rupeesToPaise(latest.total) } : null,
      });
      if (!check.ok) throw new ActionError(check.reason);
    }
    if (from === "QC" && to === "READY") {
      if (!can(ctx.user.access, "jobcards.qc")) throw new ActionError("Only QC staff can pass a job.");
      await tx.jobCard.update({
        where: { id: job.id },
        data: { qcById: ctx.user.id, qcAt: new Date(), qcNotes: input.note },
      });
    }
    if (input.diagnosis !== null)
      await tx.jobCard.update({ where: { id: job.id }, data: { diagnosis: input.diagnosis } });
    await moveTo(tx, ctx, job, to, input.note, target.id);
  });
}

export async function assignJob(ctx: ActionContext, input: z.output<typeof assignSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.assign");
    if (!OPEN_KEYS.includes(job.status.systemKey)) throw new ActionError("This job is closed.");
    if (input.engineerId) await assertEngineer(tx, job.organizationId, job.branchId, input.engineerId);
    await tx.jobCard.update({
      where: { id: job.id },
      data: { assignedEngineerId: input.engineerId, priority: input.priority },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "JobCard",
      entityId: job.id,
      branchId: job.branchId,
      before: { assignedEngineerId: job.assignedEngineerId, priority: job.priority },
      after: { assignedEngineerId: input.engineerId, priority: input.priority },
    });
  });
}

export async function addNote(ctx: ActionContext, input: z.output<typeof noteSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.view");
    await tx.jobNote.create({
      data: { jobCardId: job.id, userId: ctx.user.id, note: input.note, isInternal: !input.customerVisible },
    });
  });
}

// ---------------------------------------------------------------- labour

export async function addLabour(ctx: ActionContext, input: z.output<typeof labourSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.update");
    assertEditable(job, !!(await issuedInvoice(tx, job.id)));
    if (input.serviceRateId) {
      const rate = await tx.serviceRate.findFirst({
        where: { id: input.serviceRateId, organizationId: job.organizationId },
      });
      if (!rate) throw new ActionError("Labour charge not found.");
    }
    const line = await tx.jobLabour.create({
      data: {
        jobCardId: job.id,
        serviceRateId: input.serviceRateId,
        description: input.description,
        amount: input.amount,
        engineerId: job.assignedEngineerId ?? ctx.user.id,
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "JobLabour",
      entityId: line.id,
      branchId: job.branchId,
      after: line,
    });
  });
}

export async function removeLabour(ctx: ActionContext, input: z.output<typeof removeLineSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.update");
    assertEditable(job, !!(await issuedInvoice(tx, job.id)));
    const line = await tx.jobLabour.findFirst({ where: { id: input.lineId, jobCardId: job.id } });
    if (!line) throw new ActionError("Line not found.");
    await tx.jobLabour.delete({ where: { id: line.id } });
    await writeAudit(tx, ctx.actor, {
      action: "DELETE",
      entityType: "JobLabour",
      entityId: line.id,
      branchId: job.branchId,
      before: line,
    });
  });
}

// ---------------------------------------------------------------- parts

export async function requestPart(ctx: ActionContext, input: z.output<typeof partRequestSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "part_requests.create");
    assertEditable(job, !!(await issuedInvoice(tx, job.id)));
    const part = await tx.part.findFirst({
      where: { id: input.partId, organizationId: job.organizationId, deletedAt: null, isActive: true },
    });
    if (!part) throw new ActionError("Part not found.");
    const req = await tx.partRequest.create({
      data: { jobCardId: job.id, partId: part.id, qty: input.qty, requestedById: ctx.user.id, note: input.note },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "PartRequest",
      entityId: req.id,
      branchId: job.branchId,
      after: req,
    });
  });
}

/** Store keeper issues a part to a job: stock leaves at average cost, the job is charged the sale price. */
export async function issuePart(ctx: ActionContext, input: z.output<typeof issuePartSchema>) {
  await db.$transaction(async (tx) => {
    const job = await tx.jobCard.findFirst({
      where: { id: input.jobId, organizationId: ctx.user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!job) throw new ActionError("Job card not found.");
    const loaded = await loadJob(tx, ctx, input.jobId, "part_requests.issue");
    assertEditable(loaded, !!(await issuedInvoice(tx, loaded.id)));
    const part = await tx.part.findFirst({
      where: { id: input.partId, organizationId: loaded.organizationId, deletedAt: null },
    });
    if (!part) throw new ActionError("Part not found.");
    const unitPrice = input.unitPrice ?? (part.defaultSalePrice != null ? Number(part.defaultSalePrice) : null);
    if (unitPrice === null) throw new ActionError("This part has no sale price. Enter the price to charge.");

    if (input.requestId) {
      const req = await tx.partRequest.findFirst({
        where: { id: input.requestId, jobCardId: loaded.id, status: "PENDING" },
      });
      if (!req) throw new ActionError("That request is no longer pending.");
      await tx.partRequest.update({
        where: { id: req.id },
        data: { status: "ISSUED", issuedById: ctx.user.id, issuedAt: new Date() },
      });
    }
    const jp = await tx.jobPart.create({
      data: { jobCardId: loaded.id, partId: part.id, qty: input.qty, unitCost: 0, unitPrice },
    });
    const { unitCost } = await issueStock(tx, {
      organizationId: loaded.organizationId,
      branchId: loaded.branchId,
      partId: part.id,
      qty: input.qty,
      type: "JOB_ISSUE",
      refType: "JobPart",
      refId: jp.id,
      note: loaded.jobNo,
      userId: ctx.user.id,
    });
    const saved = await tx.jobPart.update({ where: { id: jp.id }, data: { unitCost } });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "JobPart",
      entityId: jp.id,
      branchId: loaded.branchId,
      after: saved,
    });
  });
}

export async function rejectPartRequest(ctx: ActionContext, requestId: string, note: string | null) {
  await db.$transaction(async (tx) => {
    const req = await tx.partRequest.findFirst({
      where: { id: requestId, status: "PENDING", jobCard: { organizationId: ctx.user.organizationId } },
      include: { jobCard: { select: { branchId: true } } },
    });
    if (!req) throw new ActionError("That request is no longer pending.");
    if (!canAccessBranch(ctx.user.access, "part_requests.issue", req.jobCard.branchId))
      throw new ActionError("Not your branch.");
    await tx.partRequest.update({
      where: { id: req.id },
      data: { status: "REJECTED", issuedById: ctx.user.id, issuedAt: new Date(), note: note ?? req.note },
    });
    await writeAudit(tx, ctx.actor, {
      action: "REJECT",
      entityType: "PartRequest",
      entityId: req.id,
      branchId: req.jobCard.branchId,
      after: { note },
    });
  });
}

export async function returnPart(ctx: ActionContext, input: z.output<typeof returnPartSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "part_requests.issue");
    assertEditable(job, !!(await issuedInvoice(tx, job.id)));
    const jp = await tx.jobPart.findFirst({ where: { id: input.jobPartId, jobCardId: job.id } });
    if (!jp) throw new ActionError("Part line not found.");
    const remaining = Number(jp.qty) - Number(jp.returnedQty);
    if (input.qty > remaining + 1e-9) throw new ActionError(`Only ${remaining} can be returned.`);
    await receiveStock(tx, {
      organizationId: job.organizationId,
      branchId: job.branchId,
      partId: jp.partId,
      qty: input.qty,
      unitCost: Number(jp.unitCost),
      type: "JOB_RETURN",
      refType: "JobPart",
      refId: jp.id,
      note: job.jobNo,
      userId: ctx.user.id,
    });
    await tx.jobPart.update({ where: { id: jp.id }, data: { returnedQty: { increment: input.qty } } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "JobPart",
      entityId: jp.id,
      branchId: job.branchId,
      before: { returnedQty: Number(jp.returnedQty) },
      after: { returnedQty: Number(jp.returnedQty) + input.qty },
    });
  });
}

// ---------------------------------------------------------------- warranty decisions

export async function setWarrantyPartsFree(ctx: ActionContext, input: z.output<typeof warrantyPartsFreeSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.warranty_decide");
    if (!job.isWarrantyJob) throw new ActionError("Only warranty (repeat) jobs can have free parts.");
    assertEditable(job, !!(await issuedInvoice(tx, job.id)));
    await tx.jobCard.update({ where: { id: job.id }, data: { warrantyPartsFree: input.free } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "JobCard",
      entityId: job.id,
      branchId: job.branchId,
      before: { warrantyPartsFree: job.warrantyPartsFree },
      after: { warrantyPartsFree: input.free },
    });
  });
}

export async function setPartFree(ctx: ActionContext, input: z.output<typeof freePartSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.warranty_decide");
    if (!job.isWarrantyJob) throw new ActionError("Only warranty (repeat) jobs can have free parts.");
    assertEditable(job, !!(await issuedInvoice(tx, job.id)));
    const jp = await tx.jobPart.findFirst({ where: { id: input.jobPartId, jobCardId: job.id } });
    if (!jp) throw new ActionError("Part line not found.");
    await tx.jobPart.update({ where: { id: jp.id }, data: { isFreeWarranty: input.free } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "JobPart",
      entityId: jp.id,
      branchId: job.branchId,
      before: { isFreeWarranty: jp.isFreeWarranty },
      after: { isFreeWarranty: input.free },
    });
  });
}

// ---------------------------------------------------------------- quotations

export async function sendQuote(ctx: ActionContext, input: z.output<typeof quoteSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "quotations.create");
    const key = job.status.systemKey;
    if (!["DIAGNOSIS", "IN_REPAIR", "WAITING_PARTS", "REJECTED"].includes(key)) {
      throw new ActionError("A quotation can be sent during diagnosis or repair.");
    }
    const ctxGst = gstContext(job);
    const rates = await Promise.all(
      input.items.map(async (i) => {
        if (i.partId) {
          const p = await tx.part.findFirst({
            where: { id: i.partId, organizationId: job.organizationId },
            select: { taxRate: { select: { rate: true } } },
          });
          return p?.taxRate ? Number(p.taxRate.rate) : DEFAULT_SERVICE_GST;
        }
        if (i.serviceRateId) {
          const s = await tx.serviceRate.findFirst({
            where: { id: i.serviceRateId, organizationId: job.organizationId },
            select: { taxRate: { select: { rate: true } } },
          });
          return s?.taxRate ? Number(s.taxRate.rate) : DEFAULT_SERVICE_GST;
        }
        return DEFAULT_SERVICE_GST;
      }),
    );
    const free = (kind: string) => job.isWarrantyJob && (kind === "LABOUR" || job.warrantyPartsFree);
    const calc = computeInvoice(
      input.items.map((i, idx) => ({ qty: i.qty, unitPrice: free(i.kind) ? 0 : i.unitPrice, taxRate: rates[idx] })),
      ctxGst,
    );
    await tx.quotation.updateMany({ where: { jobCardId: job.id, status: "SENT" }, data: { status: "EXPIRED" } });
    const last = await tx.quotation.findFirst({ where: { jobCardId: job.id }, orderBy: { version: "desc" } });
    const q = await tx.quotation.create({
      data: {
        jobCardId: job.id,
        version: (last?.version ?? 0) + 1,
        status: "SENT",
        sentAt: new Date(),
        validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
        subtotal: paiseToDecimalString(calc.subtotal),
        taxTotal: paiseToDecimalString(calc.cgstTotal + calc.sgstTotal + calc.igstTotal),
        total: paiseToDecimalString(calc.grandTotal),
        createdById: ctx.user.id,
        items: {
          create: input.items.map((i, idx) => ({
            kind: i.kind,
            partId: i.partId,
            serviceRateId: i.serviceRateId,
            description: i.description,
            qty: i.qty,
            unitPrice: free(i.kind) ? 0 : i.unitPrice,
            taxRate: rates[idx],
            amount: paiseToDecimalString(calc.lines[idx].total),
            sortOrder: idx,
          })),
        },
      },
    });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Quotation",
      entityId: q.id,
      branchId: job.branchId,
      after: q,
    });
    await moveTo(tx, ctx, job, "QUOTE_SENT", `Quotation v${q.version} sent: ₹${q.total.toString()}`);
  });
}

export async function recordQuoteDecision(ctx: ActionContext, input: z.output<typeof quoteDecisionSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "quotations.record_decision");
    const q = await tx.quotation.findFirst({ where: { id: input.quotationId, jobCardId: job.id } });
    if (!q || q.status !== "SENT") throw new ActionError("This quotation is no longer awaiting a decision.");
    if (job.status.systemKey !== "QUOTE_SENT") throw new ActionError("The job isn't waiting for a quote decision.");
    await tx.quotation.update({
      where: { id: q.id },
      data: { status: input.decision, decidedAt: new Date(), decisionVia: input.via, decisionNote: input.note },
    });
    await writeAudit(tx, ctx.actor, {
      action: input.decision === "APPROVED" ? "APPROVE" : "REJECT",
      entityType: "Quotation",
      entityId: q.id,
      branchId: job.branchId,
      after: { decision: input.decision, via: input.via, note: input.note },
    });
    await moveTo(
      tx,
      ctx,
      job,
      input.decision,
      `Customer ${input.decision === "APPROVED" ? "approved" : "rejected"} quotation v${q.version} (${input.via.toLowerCase().replace("_", " ")})${input.note ? `: ${input.note}` : ""}`,
    );
  });
}

// ---------------------------------------------------------------- payments

async function recordPaymentTx(tx: Tx, ctx: ActionContext, job: Job, input: z.output<typeof paymentSchema>) {
  const invoice = await issuedInvoice(tx, job.id);
  const paid = await netPaid(tx, job.id);
  if (input.kind === "ADVANCE" && invoice)
    throw new ActionError("An invoice exists: record a payment instead of an advance.");
  if (input.kind === "PAYMENT") {
    if (!invoice) throw new ActionError("Issue the invoice first, or record an advance.");
    const due = r2(Number(invoice.grandTotal) - paid);
    if (input.amount > due + 0.001) throw new ActionError(`Only ₹${due.toFixed(2)} is due.`);
  }
  if (input.kind === "REFUND") {
    const refundable = r2(paid - (invoice ? Number(invoice.grandTotal) : 0));
    if (input.amount > refundable + 0.001) {
      throw new ActionError(
        refundable > 0 ? `At most ₹${refundable.toFixed(2)} can be refunded.` : "There's nothing to refund.",
      );
    }
  }
  await assertPaymentMode(tx, job.organizationId, input.paymentModeId, input.reference);
  await assertMoneyAccount(tx, input.moneyAccountId, job.branchId);

  const receiptNo = await nextDocNumber(tx, { branchId: job.branchId, docType: "SERVICE_RECEIPT" });
  const now = new Date();
  const pay = await tx.servicePayment.create({
    data: {
      organizationId: job.organizationId,
      branchId: job.branchId,
      jobCardId: job.id,
      invoiceId: invoice?.id ?? null,
      receiptNo,
      kind: input.kind,
      paidAt: now,
      amount: input.amount,
      paymentModeId: input.paymentModeId,
      moneyAccountId: input.moneyAccountId,
      reference: input.reference,
      receivedById: ctx.user.id,
    },
  });
  const sign = input.kind === "REFUND" ? -1 : 1;
  if (invoice)
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: { increment: sign * input.amount } } });
  if (input.kind !== "PAYMENT")
    await tx.jobCard.update({ where: { id: job.id }, data: { advanceAmount: { increment: sign * input.amount } } });
  await recordMoney(tx, {
    organizationId: job.organizationId,
    branchId: job.branchId,
    moneyAccountId: input.moneyAccountId,
    date: istDateOnly(now),
    direction: input.kind === "REFUND" ? "OUT" : "IN",
    amount: input.amount,
    source: input.kind === "REFUND" ? "SERVICE_REFUND" : "INVOICE_PAYMENT",
    refType: "ServicePayment",
    refId: pay.id,
    narration: `${input.kind === "ADVANCE" ? "Advance" : input.kind === "REFUND" ? "Refund" : "Payment"} · ${job.jobNo} · ${receiptNo}`,
    createdById: ctx.user.id,
  });
  await writeAudit(tx, ctx.actor, {
    action: "CREATE",
    entityType: "ServicePayment",
    entityId: pay.id,
    branchId: job.branchId,
    after: pay,
  });
  return pay;
}

export async function recordPayment(ctx: ActionContext, input: z.output<typeof paymentSchema>) {
  return db.$transaction(async (tx) => {
    const perm: PermissionKey = input.kind === "PAYMENT" ? "invoices.collect_payment" : "jobcards.update";
    if (!can(ctx.user.access, perm) && !can(ctx.user.access, "invoices.collect_payment")) {
      throw new ActionError("You can't collect money on job cards.");
    }
    const job = await loadJob(tx, ctx, input.jobId, can(ctx.user.access, perm) ? perm : "invoices.collect_payment");
    if (["DELIVERED", "CANCELLED"].includes(job.status.systemKey) && input.kind === "ADVANCE") {
      throw new ActionError("This job is closed.");
    }
    const pay = await recordPaymentTx(tx, ctx, job, input);
    return { id: pay.id, receiptNo: pay.receiptNo };
  });
}

// ---------------------------------------------------------------- invoice

export async function createInvoice(ctx: ActionContext, jobId: string) {
  return db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, jobId, "invoices.create");
    if (job.status.systemKey !== "READY")
      throw new ActionError("Invoice the job once it's ready for pickup (after QC).");
    if (await issuedInvoice(tx, job.id)) throw new ActionError("This job already has an invoice.");
    const lines = await currentCharges(tx, job);
    const gst = gstContext(job);
    const calc = computeInvoice(
      lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, taxRate: l.taxRate })),
      gst,
    );
    if (calc.grandTotal <= 0)
      throw new ActionError("Nothing to bill (no charges, or all free under warranty). Deliver without an invoice.");

    const [company, branch] = await Promise.all([
      tx.setting.findUnique({ where: { organizationId_key: { organizationId: job.organizationId, key: "company" } } }),
      tx.branch.findUniqueOrThrow({ where: { id: job.branchId }, include: { gstRegistration: true } }),
    ]);
    const kind = branch.gstRegistration ? "TAX_INVOICE" : "NON_GST_INVOICE";
    const invoiceNo = await nextDocNumber(tx, { branchId: job.branchId, docType: kind });
    const profile = (company?.value ?? {}) as Record<string, unknown>;
    const invoice = await tx.invoice.create({
      data: {
        organizationId: job.organizationId,
        branchId: job.branchId,
        kind,
        invoiceNo,
        invoiceDate: istDateOnly(new Date()),
        status: "ISSUED",
        gstRegistrationId: branch.gstRegistrationId,
        sellerSnapshot: {
          name: branch.gstRegistration?.legalName ?? profile.legalName ?? profile.name ?? "",
          tradeName: branch.gstRegistration?.tradeName ?? profile.name ?? "",
          branchName: branch.name,
          address: [branch.addressLine1, branch.addressLine2, `${branch.city} ${branch.pincode}`]
            .filter(Boolean)
            .join(", "),
          phone: branch.phone,
          email: branch.email ?? profile.email ?? null,
          gstin: branch.gstRegistration?.gstin ?? null,
          stateCode: branch.gstRegistration?.stateCode ?? branch.stateCode,
          stateName: branch.gstRegistration?.stateName ?? null,
        },
        customerName: job.customer.name,
        customerPhone: job.customer.phone,
        customerAddress: job.customer.address,
        customerGstin: job.customer.gstin,
        placeOfSupply: gst.interState
          ? job.customer.gstin!.slice(0, 2)
          : (branch.gstRegistration?.stateCode ?? branch.stateCode),
        isInterState: gst.interState,
        jobCardId: job.id,
        customerId: job.customerId,
        subtotal: paiseToDecimalString(calc.subtotal),
        discountTotal: paiseToDecimalString(calc.discountTotal),
        cgstTotal: paiseToDecimalString(calc.cgstTotal),
        sgstTotal: paiseToDecimalString(calc.sgstTotal),
        igstTotal: paiseToDecimalString(calc.igstTotal),
        roundOff: paiseToDecimalString(calc.roundOff),
        grandTotal: paiseToDecimalString(calc.grandTotal),
        createdById: ctx.user.id,
        items: {
          create: lines.map((l, i) => ({
            kind: l.kind,
            description: l.free ? `${l.description} (warranty – no charge)` : l.description,
            hsnSac: l.hsnSac,
            partId: l.partId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxableValue: paiseToDecimalString(calc.lines[i].taxable),
            taxRate: calc.lines[i].taxRate,
            cgst: paiseToDecimalString(calc.lines[i].cgst),
            sgst: paiseToDecimalString(calc.lines[i].sgst),
            igst: paiseToDecimalString(calc.lines[i].igst),
            total: paiseToDecimalString(calc.lines[i].total),
            sortOrder: i,
          })),
        },
      },
    });
    // Advances (and any refunds) collected so far are adjusted against this invoice.
    await tx.servicePayment.updateMany({
      where: { jobCardId: job.id, invoiceId: null },
      data: { invoiceId: invoice.id },
    });
    const paid = await netPaid(tx, job.id);
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: paid } });
    await writeAudit(tx, ctx.actor, {
      action: "CREATE",
      entityType: "Invoice",
      entityId: invoice.id,
      branchId: job.branchId,
      after: invoice,
    });
    return { id: invoice.id, invoiceNo };
  });
}

export async function cancelInvoice(ctx: ActionContext, invoiceId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId: ctx.user.organizationId } });
    if (!inv || inv.status !== "ISSUED") throw new ActionError("Only an issued invoice can be cancelled.");
    if (!canAccessBranch(ctx.user.access, "invoices.cancel", inv.branchId)) throw new ActionError("Not your branch.");
    if (inv.jobCardId) {
      const job = await tx.jobCard.findUnique({ where: { id: inv.jobCardId }, include: { status: true } });
      if (job?.status.systemKey === "DELIVERED")
        throw new ActionError("The device has been delivered. Issue a credit note from the invoice instead.");
    }
    await tx.invoice.update({
      where: { id: inv.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    // Money already received stays on the job and is adjusted on the next invoice.
    await tx.servicePayment.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Invoice",
      entityId: inv.id,
      branchId: inv.branchId,
      before: { status: "ISSUED" },
      after: { status: "CANCELLED", reason },
    });
  });
}

// ---------------------------------------------------------------- deliver / cancel

export async function deliver(ctx: ActionContext, input: z.output<typeof deliverSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.deliver");
    if (job.status.systemKey !== "READY")
      throw new ActionError("Only a job that is ready for pickup can be delivered.");
    const lines = await currentCharges(tx, job);
    const total = chargesTotalPaise(lines, gstContext(job));
    const invoice = await issuedInvoice(tx, job.id);
    const paid = await netPaid(tx, job.id);
    let onCredit = false;
    if (total > 0) {
      if (!invoice) throw new ActionError("Issue the invoice before delivering.");
      const due = r2(Number(invoice.grandTotal) - paid);
      if (due > 0.001) {
        if (!input.onCredit)
          throw new ActionError(`₹${due.toFixed(2)} is still due. Collect it, or deliver on credit.`);
        if (!can(ctx.user.access, "jobcards.deliver_credit"))
          throw new ActionError("You can't hand over devices with a balance due.");
        onCredit = true;
      }
    } else if (paid > 0.001) {
      throw new ActionError(`Nothing is billed but ₹${paid.toFixed(2)} was collected. Refund it first.`);
    }

    // Warranty only for jobs that were actually repaired.
    const history = await tx.jobStatusHistory.findMany({
      where: { jobCardId: job.id },
      include: { toStatus: { select: { systemKey: true, pausesTat: true } } },
      orderBy: { createdAt: "asc" },
    });
    const repaired = history.some((h) => h.toStatus.systemKey === "IN_REPAIR");
    let warrantyDays: number | null = null;
    if (repaired) {
      const rules = await tx.warrantyRule.findMany({ where: { organizationId: job.organizationId, isActive: true } });
      warrantyDays = pickWarrantyDays(rules, job.device.deviceTypeId, job.problemCategoryId);
    }
    const now = new Date();
    await tx.jobCard.update({
      where: { id: job.id },
      data: {
        deliveredAt: now,
        deliveredById: ctx.user.id,
        deliveredOnCredit: onCredit,
        warrantyDays,
        warrantyUntil: warrantyDays ? addDays(istDateOnly(now), warrantyDays) : null,
        tatMinutes: turnaroundMinutes(
          job.receivedAt,
          now,
          history.map((h) => ({ at: h.createdAt, pausesTat: h.toStatus.pausesTat })),
        ),
        unlockCodeEnc: null, // never keep device passwords after handover
      },
    });
    await moveTo(tx, ctx, job, "DELIVERED", onCredit ? "Delivered with balance due" : "Delivered");
  });
}

export async function cancelJob(ctx: ActionContext, input: z.output<typeof cancelJobSchema>) {
  await db.$transaction(async (tx) => {
    const job = await loadJob(tx, ctx, input.jobId, "jobcards.cancel");
    if (!OPEN_KEYS.includes(job.status.systemKey)) throw new ActionError("This job is already closed.");
    if (await issuedInvoice(tx, job.id)) throw new ActionError("Cancel the invoice first.");
    const paid = await netPaid(tx, job.id);
    if (paid > 0.001) throw new ActionError(`Refund the ₹${paid.toFixed(2)} collected before cancelling.`);
    // Unused parts go back to stock.
    const parts = await tx.jobPart.findMany({ where: { jobCardId: job.id } });
    for (const jp of parts) {
      const remaining = Number(jp.qty) - Number(jp.returnedQty);
      if (remaining <= 0) continue;
      await receiveStock(tx, {
        organizationId: job.organizationId,
        branchId: job.branchId,
        partId: jp.partId,
        qty: remaining,
        unitCost: Number(jp.unitCost),
        type: "JOB_RETURN",
        refType: "JobPart",
        refId: jp.id,
        note: `${job.jobNo} cancelled`,
        userId: ctx.user.id,
      });
      await tx.jobPart.update({ where: { id: jp.id }, data: { returnedQty: jp.qty } });
    }
    await tx.partRequest.updateMany({ where: { jobCardId: job.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.jobCard.update({ where: { id: job.id }, data: { cancelReason: input.reason, unlockCodeEnc: null } });
    await moveTo(tx, ctx, job, "CANCELLED", input.reason);
  });
}

// ---------------------------------------------------------------- unlock code

/** Only the assigned engineer, or someone with jobcards.view_unlock_code in the branch. Every reveal is audited. */
export async function revealUnlockCode(ctx: ActionContext, jobId: string) {
  return db.$transaction(async (tx) => {
    const job = await tx.jobCard.findFirst({
      where: { id: jobId, organizationId: ctx.user.organizationId, deletedAt: null },
    });
    if (!job) throw new ActionError("Job card not found.");
    const allowed =
      job.assignedEngineerId === ctx.user.id ||
      (can(ctx.user.access, "jobcards.view_unlock_code") &&
        canAccessBranch(ctx.user.access, "jobcards.view_unlock_code", job.branchId));
    if (!allowed) throw new ActionError("Only the assigned engineer or the service manager can see the unlock code.");
    if (!job.unlockCodeEnc) throw new ActionError("No unlock code is stored for this job.");
    await tx.jobCard.update({
      where: { id: job.id },
      data: { unlockRevealedAt: new Date(), unlockRevealedById: ctx.user.id },
    });
    await writeAudit(tx, ctx.actor, {
      action: "REVEAL_SECRET",
      entityType: "JobCard",
      entityId: job.id,
      branchId: job.branchId,
      after: { field: "unlockCode" },
    });
    return decryptSecret(job.unlockCodeEnc);
  });
}
