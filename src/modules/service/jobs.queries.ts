import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { JobStatusKey } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, branchWhere, can, canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { isInterState } from "@/modules/tax/gst";
import { DEFAULT_SERVICE_GST, buildChargeLines, chargesTotalPaise } from "./charges";
import { OPEN_KEYS, chargesEditable, manualTargets, underWarranty } from "./workflow";

/** Branch + own-records filter for job lists. */
export function jobScopeWhere(user: CurrentUser, activeBranchId: string | null): Prisma.JobCardWhereInput {
  const c = branchConstraint(user.access, "jobcards.view", activeBranchId);
  return {
    organizationId: user.organizationId,
    deletedAt: null,
    ...branchWhere(c),
    ...(c.ownOnly ? { assignedEngineerId: user.id } : {}),
  };
}

export async function listJobs(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const f = p.filters;
  const where: Prisma.JobCardWhereInput = {
    ...jobScopeWhere(user, activeBranchId),
    ...(f.status === "open" || !f.status
      ? { status: { systemKey: { in: OPEN_KEYS } } }
      : f.status === "all"
        ? {}
        : { status: { systemKey: f.status as JobStatusKey } }),
    ...(f.engineer === "none" ? { assignedEngineerId: null } : f.engineer ? { assignedEngineerId: f.engineer } : {}),
    ...(f.priority ? { priority: f.priority as never } : {}),
    ...(f.overdue === "1" ? { estimatedAt: { lt: new Date() }, status: { systemKey: { in: OPEN_KEYS } } } : {}),
    ...(p.q
      ? {
          OR: [
            { jobNo: { contains: p.q, mode: "insensitive" } },
            { customer: { phone: { contains: p.q } } },
            { customer: { name: { contains: p.q, mode: "insensitive" } } },
            { device: { imei: { contains: p.q } } },
            { device: { serialNo: { contains: p.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.jobCard.findMany({
      where,
      include: {
        status: { select: { name: true, color: true, systemKey: true } },
        customer: { select: { name: true, phone: true } },
        device: {
          select: {
            modelText: true,
            brand: { select: { name: true } },
            model: { select: { name: true } },
            deviceType: { select: { name: true } },
          },
        },
        assignedEngineer: { select: { name: true } },
        branch: { select: { code: true } },
      },
      orderBy:
        p.sort === "estimatedAt" ? { estimatedAt: p.dir } : { receivedAt: p.sort === "receivedAt" ? p.dir : "desc" },
      ...paging(p),
    }),
    db.jobCard.count({ where }),
  ]);
  const now = Date.now();
  return {
    total,
    rows: rows.map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      branchCode: j.branch.code,
      customer: j.customer.name,
      phone: j.customer.phone,
      device:
        [j.device.brand?.name, j.device.model?.name ?? j.device.modelText].filter(Boolean).join(" ") ||
        j.device.deviceType.name,
      status: j.status.name,
      statusKey: j.status.systemKey,
      tone: j.status.color,
      engineer: j.assignedEngineer?.name ?? null,
      priority: j.priority,
      receivedAt: j.receivedAt.toISOString(),
      estimatedAt: j.estimatedAt?.toISOString() ?? null,
      overdue: !!j.estimatedAt && j.estimatedAt.getTime() < now && OPEN_KEYS.includes(j.status.systemKey),
      isWarrantyJob: j.isWarrantyJob,
    })),
  };
}
export type JobRow = Awaited<ReturnType<typeof listJobs>>["rows"][number];

/** Engineers who can be assigned in the given branches (anyone with jobcards.update there). */
export async function engineerOptions(organizationId: string, branchIds: string[] | null) {
  const users = await db.user.findMany({
    where: {
      organizationId,
      isActive: true,
      deletedAt: null,
      ...(branchIds ? { branches: { some: { branchId: { in: branchIds } } } } : {}),
      roles: {
        some: { role: { deletedAt: null, permissions: { some: { permission: { key: "jobcards.change_status" } } } } },
      },
    },
    select: { id: true, name: true, branches: { select: { branchId: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ value: u.id, label: u.name, branchIds: u.branches.map((b) => b.branchId) }));
}

/** Masters for the intake form. */
export async function intakeOptions(organizationId: string) {
  const [deviceTypes, brands, models, problems] = await Promise.all([
    db.deviceType.findMany({ where: { organizationId, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.brand.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
    db.deviceModel.findMany({ where: { isActive: true, brand: { organizationId } }, orderBy: { name: "asc" } }),
    db.problemCategory.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    deviceTypes: deviceTypes.map((d) => ({ value: d.id, label: d.name })),
    brands: brands.map((b) => ({ value: b.id, label: b.name })),
    models: models.map((m) => ({ value: m.id, label: m.name, brandId: m.brandId, deviceTypeId: m.deviceTypeId })),
    problems: problems.map((p) => ({ value: p.id, label: p.name, deviceTypeId: p.deviceTypeId })),
  };
}

export async function lookupCustomerByPhone(user: CurrentUser, phone: string) {
  const c = await db.customer.findFirst({
    where: { organizationId: user.organizationId, phone, deletedAt: null },
    include: {
      devices: {
        include: {
          brand: { select: { name: true } },
          model: { select: { name: true } },
          deviceType: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    address: c.address,
    gstin: c.gstin,
    devices: c.devices.map((d) => ({
      id: d.id,
      deviceTypeId: d.deviceTypeId,
      label: [
        d.deviceType.name,
        d.brand?.name,
        d.model?.name ?? d.modelText,
        d.imei ? `IMEI ${d.imei}` : d.serialNo ? `S/N ${d.serialNo}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      imei: d.imei,
      serialNo: d.serialNo,
    })),
  };
}

/** Earlier delivered jobs on the same device that are still under warranty. */
export async function findComebackCandidates(
  user: CurrentUser,
  input: { deviceId?: string | null; imei?: string | null; serialNo?: string | null },
) {
  const or: Prisma.JobCardWhereInput[] = [];
  if (input.deviceId) or.push({ deviceId: input.deviceId });
  if (input.imei?.trim()) or.push({ device: { imei: input.imei.trim() } });
  if (input.serialNo?.trim()) or.push({ device: { serialNo: input.serialNo.trim() } });
  if (or.length === 0) return [];
  const jobs = await db.jobCard.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { systemKey: "DELIVERED" },
      warrantyUntil: { not: null },
      OR: or,
    },
    include: { problemCategory: { select: { name: true } } },
    orderBy: { deliveredAt: "desc" },
    take: 5,
  });
  const now = new Date();
  return jobs
    .filter((j) => underWarranty(j.warrantyUntil, now))
    .map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      deliveredAt: j.deliveredAt?.toISOString() ?? null,
      warrantyUntil: j.warrantyUntil!.toISOString(),
      problem: j.problemCategory?.name ?? j.problemReported.slice(0, 60),
    }));
}

/** Everything the job detail page needs, plus what the viewer may do. */
export async function getJob(user: CurrentUser, id: string) {
  const job = await db.jobCard.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      status: true,
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          gstRegistrationId: true,
          gstRegistration: { select: { stateCode: true } },
        },
      },
      customer: true,
      device: { include: { brand: true, model: true, deviceType: true } },
      problemCategory: true,
      receivedBy: { select: { name: true } },
      assignedEngineer: { select: { id: true, name: true } },
      qcBy: { select: { name: true } },
      deliveredBy: { select: { name: true } },
      parentJob: { select: { id: true, jobNo: true } },
      comebacks: { select: { id: true, jobNo: true } },
      history: {
        include: { toStatus: { select: { name: true, color: true } }, changedBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      notes: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      quotations: {
        include: { items: { orderBy: { sortOrder: "asc" } }, createdBy: { select: { name: true } } },
        orderBy: { version: "desc" },
      },
      partRequests: {
        include: { part: { select: { name: true, sku: true } }, requestedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      parts: {
        include: {
          part: {
            select: {
              name: true,
              sku: true,
              unit: { select: { symbol: true } },
              hsnSac: { select: { code: true } },
              taxRate: { select: { rate: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      labour: {
        include: {
          serviceRate: { select: { hsnSac: { select: { code: true } }, taxRate: { select: { rate: true } } } },
        },
      },
      invoices: { where: { kind: { not: "CREDIT_NOTE" } }, orderBy: { createdAt: "desc" } },
      payments: {
        include: { paymentMode: { select: { name: true } }, receivedBy: { select: { name: true } } },
        orderBy: { paidAt: "asc" },
      },
    },
  });
  if (!job) return null;
  const a = user.access;
  if (!canAccessBranch(a, "jobcards.view", job.branchId)) return null;
  if (scopeOf(a, "jobcards.view") === "OWN" && job.assignedEngineerId !== user.id) return null;

  const lines = buildChargeLines({
    isWarrantyJob: job.isWarrantyJob,
    warrantyPartsFree: job.warrantyPartsFree,
    parts: job.parts.map((p) => ({
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
    labour: job.labour.map((l) => ({
      id: l.id,
      description: l.description,
      amount: Number(l.amount),
      taxRate: l.serviceRate?.taxRate ? Number(l.serviceRate.taxRate.rate) : DEFAULT_SERVICE_GST,
      sac: l.serviceRate?.hsnSac?.code ?? null,
    })),
  });
  const gst = {
    registered: !!job.branch.gstRegistrationId,
    interState: isInterState(job.branch.gstRegistration?.stateCode, job.customer.gstin),
    pricesIncludeTax: true,
  };
  const chargesTotal = chargesTotalPaise(lines, gst) / 100;
  const invoice = job.invoices.find((i) => i.status === "ISSUED") ?? null;
  const netPaid =
    Math.round(job.payments.reduce((s, p) => s + (p.kind === "REFUND" ? -1 : 1) * Number(p.amount), 0) * 100) / 100;
  const key = job.status.systemKey;
  const editable = chargesEditable(key, !!invoice);
  const inBranch = (perm: Parameters<typeof canAccessBranch>[1]) => canAccessBranch(a, perm, job.branchId);
  const open = OPEN_KEYS.includes(key);
  const photos = await db.attachment.findMany({
    where: { entityType: "JobCard", entityId: job.id, file: { deletedAt: null } },
    select: { id: true, fileId: true, label: true },
    orderBy: { createdAt: "asc" },
  });
  const statuses = await db.jobStatus.findMany({
    where: { organizationId: user.organizationId, isActive: true, systemKey: { in: manualTargets(key) } },
    orderBy: { sortOrder: "asc" },
  });

  return {
    job,
    lines,
    chargesTotal,
    invoice,
    netPaid,
    due: invoice ? Math.round((Number(invoice.grandTotal) - netPaid) * 100) / 100 : null,
    hasUnlockCode: !!job.unlockCodeEnc,
    photos: photos.map((p) => ({ id: p.id, url: `/api/files/${p.fileId}`, label: p.label })),
    nextStatuses: statuses.map((s) => ({ value: s.id, label: s.name, key: s.systemKey })),
    can: {
      changeStatus: open && inBranch("jobcards.change_status") && statuses.length > 0,
      assign: open && inBranch("jobcards.assign"),
      editCharges: editable && inBranch("jobcards.update"),
      requestPart: editable && inBranch("part_requests.create"),
      issuePart: editable && inBranch("part_requests.issue"),
      warrantyDecide: job.isWarrantyJob && editable && inBranch("jobcards.warranty_decide"),
      quote: ["DIAGNOSIS", "IN_REPAIR", "WAITING_PARTS", "REJECTED"].includes(key) && inBranch("quotations.create"),
      recordDecision: key === "QUOTE_SENT" && inBranch("quotations.record_decision"),
      advance: open && !invoice && (inBranch("jobcards.update") || inBranch("invoices.collect_payment")),
      collect: !!invoice && Number(invoice.grandTotal) - netPaid > 0.001 && inBranch("invoices.collect_payment"),
      refund:
        netPaid - (invoice ? Number(invoice.grandTotal) : 0) > 0.001 &&
        (inBranch("jobcards.update") || inBranch("invoices.collect_payment")),
      invoice: key === "READY" && !invoice && chargesTotal > 0 && inBranch("invoices.create"),
      cancelInvoice: !!invoice && key !== "DELIVERED" && inBranch("invoices.cancel"),
      deliver: key === "READY" && inBranch("jobcards.deliver"),
      deliverCredit: can(a, "jobcards.deliver_credit"),
      cancel: open && inBranch("jobcards.cancel"),
      revealUnlock:
        !!job.unlockCodeEnc && (job.assignedEngineerId === user.id || inBranch("jobcards.view_unlock_code")),
      note: true,
      addPhoto: inBranch("jobcards.update"),
    },
  };
}
export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJob>>>;

/** Labour charges for pickers (optionally matching the device type). */
export async function labourOptions(organizationId: string) {
  const rows = await db.serviceRate.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } });
  return rows.map((r) => ({ value: r.id, label: r.name, amount: Number(r.amount) }));
}

// ---------------------------------------------------------------- customers

export async function listCustomers(user: CurrentUser, p: ListParams) {
  const where: Prisma.CustomerWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" } },
            { phone: { contains: p.q } },
            {
              devices: {
                some: { OR: [{ imei: { contains: p.q } }, { serialNo: { contains: p.q, mode: "insensitive" } }] },
              },
            },
          ],
        }
      : {}),
  };
  const scope = branchConstraint(user.access, "jobcards.view", null);
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        _count: { select: { devices: true } },
        jobCards: {
          where: { ...branchWhere(scope), deletedAt: null },
          select: { receivedAt: true },
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      ...paging(p),
    }),
    db.customer.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      gstin: c.gstin,
      devices: c._count.devices,
      lastVisit: c.jobCards[0]?.receivedAt.toISOString() ?? null,
    })),
  };
}
export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>["rows"][number];

export async function getCustomer(user: CurrentUser, id: string) {
  const c = await db.customer.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      devices: { include: { brand: true, model: true, deviceType: true }, orderBy: { createdAt: "desc" } },
      jobCards: {
        where: jobScopeWhere(user, null),
        include: { status: { select: { name: true, color: true } }, device: { select: { id: true } } },
        orderBy: { receivedAt: "desc" },
      },
    },
  });
  return c;
}
