import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, branchWhere } from "@/modules/rbac/access";

export async function listInvoices(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "invoices.view", activeBranchId);
  const f = p.filters;
  const where: Prisma.InvoiceWhereInput = {
    organizationId: user.organizationId,
    ...branchWhere(scope),
    ...(f.status === "due" ? { status: "ISSUED" } : f.status ? { status: f.status as never } : {}),
    ...(f.kind ? { kind: f.kind as never } : {}),
    ...(p.q
      ? {
          OR: [
            { invoiceNo: { contains: p.q, mode: "insensitive" } },
            { customerName: { contains: p.q, mode: "insensitive" } },
            { customerPhone: { contains: p.q } },
            { jobCard: { jobNo: { contains: p.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const rows = await db.invoice.findMany({
    where,
    include: { jobCard: { select: { id: true, jobNo: true } }, branch: { select: { code: true } } },
    orderBy: { createdAt: "desc" },
    ...(f.status === "due" ? { skip: 0, take: 1000 } : paging(p)),
  });
  const mapped = rows.map((i) => ({
    id: i.id,
    invoiceNo: i.invoiceNo,
    kind: i.kind,
    date: i.invoiceDate.toISOString(),
    customer: i.customerName,
    phone: i.customerPhone,
    jobId: i.jobCard?.id ?? null,
    jobNo: i.jobCard?.jobNo ?? null,
    branchCode: i.branch.code,
    total: Number(i.grandTotal),
    due: Math.round((Number(i.grandTotal) - Number(i.amountPaid)) * 100) / 100,
    status: i.status,
  }));
  if (f.status === "due") {
    const dues = mapped.filter((r) => r.due > 0.001);
    const start = (p.page - 1) * p.pageSize;
    return {
      total: dues.length,
      rows: dues.slice(start, start + p.pageSize),
      dueTotal: dues.reduce((a, r) => a + r.due, 0),
    };
  }
  return { total: await db.invoice.count({ where }), rows: mapped, dueTotal: null };
}
export type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>["rows"][number];

export async function getInvoice(user: CurrentUser, id: string, permission: "invoices.view" = "invoices.view") {
  const inv = await db.invoice.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      payments: { include: { paymentMode: { select: { name: true } } }, orderBy: { paidAt: "asc" } },
      jobCard: {
        select: {
          id: true,
          jobNo: true,
          device: {
            select: {
              imei: true,
              serialNo: true,
              modelText: true,
              brand: { select: { name: true } },
              model: { select: { name: true } },
            },
          },
        },
      },
      createdBy: { select: { name: true } },
      originalInvoice: { select: { id: true, invoiceNo: true, invoiceDate: true } },
      creditNotes: {
        where: { status: "ISSUED" },
        select: { id: true, invoiceNo: true, invoiceDate: true, grandTotal: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!inv) return null;
  const scope = branchConstraint(user.access, permission, null);
  if (scope.branchIds && !scope.branchIds.includes(inv.branchId)) return null;
  return inv;
}
