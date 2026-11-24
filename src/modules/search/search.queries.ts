import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, can, type BranchConstraint } from "@/modules/rbac/access";

/** Global search: students, enquiries, job cards, customers, invoices, receipts. Each section needs its permission. */
export type SearchHit = { id: string; title: string; sub: string; href: string };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };

const LIMIT = 8;
const branchIn = (c: BranchConstraint) => (c.branchIds === null ? {} : { branchId: { in: c.branchIds } });
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function globalSearch(user: CurrentUser, raw: string): Promise<SearchGroup[]> {
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return [];
  const orgId = user.organizationId;
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? digits.slice(-10) : null;
  const groups: SearchGroup[] = [];

  if (can(user.access, "students.view")) {
    const c = branchConstraint(user.access, "students.view", null);
    const text = {
      OR: [
        { name: ci(q) },
        { studentCode: ci(q) },
        { email: ci(q) },
        ...(phone ? [{ phone: { contains: phone } }] : []),
      ],
    };
    const scoped =
      c.branchIds === null
        ? {}
        : { OR: [{ branchId: { in: c.branchIds } }, { enrollments: { some: { branchId: { in: c.branchIds } } } }] };
    const hits = await db.student.findMany({
      where: { organizationId: orgId, deletedAt: null, AND: [text, scoped] },
      take: LIMIT,
      orderBy: { name: "asc" },
      select: { id: true, name: true, studentCode: true, phone: true },
    });
    groups.push({
      key: "students",
      label: "Students",
      hits: hits.map((s) => ({
        id: s.id,
        title: s.name,
        sub: `${s.studentCode} · ${s.phone}`,
        href: `/admin/students/${s.id}`,
      })),
    });
  }

  if (can(user.access, "leads.view")) {
    const c = branchConstraint(user.access, "leads.view", null);
    const rows = await db.lead.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...branchIn(c),
        ...(c.ownOnly ? { assignedToId: user.id } : {}),
        OR: [{ name: ci(q) }, ...(phone ? [{ phone: { contains: phone } }] : [])],
      },
      take: LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, status: { select: { name: true } } },
    });
    groups.push({
      key: "leads",
      label: "Enquiries",
      hits: rows.map((l) => ({
        id: l.id,
        title: l.name,
        sub: `${l.phone} · ${l.status.name}`,
        href: `/admin/leads/${l.id}`,
      })),
    });
  }

  if (can(user.access, "jobcards.view")) {
    const c = branchConstraint(user.access, "jobcards.view", null);
    // Phone numbers only for people allowed to see customer contact details (not engineers).
    const contact = can(user.access, "customers.view");
    const rows = await db.jobCard.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...branchIn(c),
        ...(c.ownOnly ? { assignedEngineerId: user.id } : {}),
        OR: [
          { jobNo: ci(q) },
          { customer: { name: ci(q) } },
          ...(phone && contact ? [{ customer: { phone: { contains: phone } } }] : []),
          { device: { OR: [{ imei: ci(q) }, { serialNo: ci(q) }] } },
        ],
      },
      take: LIMIT,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        jobNo: true,
        customer: { select: { name: true, phone: true } },
        status: { select: { name: true } },
      },
    });
    groups.push({
      key: "jobs",
      label: "Job cards",
      hits: rows.map((j) => ({
        id: j.id,
        title: j.jobNo,
        sub: [j.customer.name, contact ? j.customer.phone : null, j.status.name].filter(Boolean).join(" · "),
        href: `/admin/service/jobs/${j.id}`,
      })),
    });
  }
  if (can(user.access, "customers.view")) {
    const c = branchConstraint(user.access, "customers.view", null);
    const customers = await db.customer.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(c.branchIds === null
          ? {}
          : {
              AND: [
                { OR: [{ branchId: { in: c.branchIds } }, { jobCards: { some: { branchId: { in: c.branchIds } } } }] },
              ],
            }),
        OR: [{ name: ci(q) }, ...(phone ? [{ phone: { contains: phone } }] : [])],
      },
      take: LIMIT,
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    });
    groups.push({
      key: "customers",
      label: "Service customers",
      hits: customers.map((x) => ({ id: x.id, title: x.name, sub: x.phone, href: `/admin/service/customers/${x.id}` })),
    });
  }

  if (can(user.access, "invoices.view")) {
    const c = branchConstraint(user.access, "invoices.view", null);
    const rows = await db.invoice.findMany({
      where: {
        organizationId: orgId,
        ...branchIn(c),
        OR: [{ invoiceNo: ci(q) }, { customerName: ci(q) }, ...(phone ? [{ customerPhone: { contains: phone } }] : [])],
      },
      take: LIMIT,
      orderBy: { invoiceDate: "desc" },
      select: { id: true, invoiceNo: true, customerName: true, grandTotal: true },
    });
    groups.push({
      key: "invoices",
      label: "Invoices",
      hits: rows.map((i) => ({
        id: i.id,
        title: i.invoiceNo,
        sub: `${i.customerName} · ₹${Number(i.grandTotal).toLocaleString("en-IN")}`,
        href: `/admin/invoices/${i.id}`,
      })),
    });
  }

  if (can(user.access, "fees.view")) {
    const c = branchConstraint(user.access, "fees.view", null);
    const rows = await db.feePayment.findMany({
      where: { organizationId: orgId, ...branchIn(c), receiptNo: ci(q) },
      take: LIMIT,
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        enrollment: { select: { student: { select: { id: true, name: true } } } },
      },
    });
    groups.push({
      key: "receipts",
      label: "Fee receipts",
      hits: rows.map((r) => ({
        id: r.id,
        title: r.receiptNo,
        sub: `${r.enrollment.student.name} · ₹${Number(r.amount).toLocaleString("en-IN")}`,
        href: `/admin/students/${r.enrollment.student.id}`,
      })),
    });
  }

  return groups.filter((g) => g.hits.length > 0);
}
