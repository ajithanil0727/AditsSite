import "server-only";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import type { PermissionKey } from "@/lib/permissions";
import type { CurrentUser } from "@/modules/auth/current";
import { attendancePercent } from "@/modules/fees/fee-logic";
import { getCertificateRules } from "@/modules/academics/academics.service";
import { branchConstraint, canAccessBranch, type BranchConstraint } from "@/modules/rbac/access";

/**
 * Reports: one definition per report (columns + query). The page, the print view (PDF) and the Excel export
 * all read the same rows, so they always agree. Same permission and branch scope as the module's screens.
 */
export type ColumnType = "text" | "date" | "money" | "number" | "percent";
export type Column = { key: string; label: string; type: ColumnType; total?: boolean };
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Filters = { from: string; to: string; branchId: string | null };

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  group: "Students" | "Service" | "Inventory" | "Placements";
  permission: PermissionKey;
  /** false = a snapshot as of today (date filter not used). */
  usesDates: boolean;
  columns: Column[];
  run: (scope: { orgId: string; userId: string; c: BranchConstraint; f: Filters }) => Promise<Row[]>;
};

const DAY = 86_400_000;
const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymd = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : null);
/** IST calendar day range → UTC instants for DateTime (timestamp) columns. */
const istRange = (f: Filters) => ({ gte: new Date(d(f.from).getTime() - 330 * 60_000), lt: new Date(d(f.to).getTime() + DAY - 330 * 60_000) });
const istDay = (x: Date) => new Date(x.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const branchIn = (c: BranchConstraint, field = "branchId") => (c.branchIds === null ? {} : { [field]: { in: c.branchIds } });
const round2 = (n: number) => Math.round(n * 100) / 100;

export const REPORTS: ReportDef[] = [
  {
    key: "admissions",
    title: "Admissions",
    description: "Students admitted in the period, with course, fee and status.",
    group: "Students",
    permission: "students.view",
    usesDates: true,
    columns: [
      { key: "date", label: "Admitted", type: "date" },
      { key: "student", label: "Student", type: "text" },
      { key: "code", label: "Student ID", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "course", label: "Course", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "netFee", label: "Net fee", type: "money", total: true },
      { key: "status", label: "Status", type: "text" },
    ],
    run: async ({ orgId, c, f }) => {
      const rows = await db.enrollment.findMany({
        where: { organizationId: orgId, deletedAt: null, enrolledAt: { gte: d(f.from), lte: d(f.to) }, ...branchIn(c) },
        include: { student: true, course: { select: { name: true } }, branch: { select: { code: true } } },
        orderBy: [{ enrolledAt: "asc" }],
      });
      return rows.map((e) => ({
        date: ymd(e.enrolledAt),
        student: e.student.name,
        code: e.student.studentCode,
        phone: e.student.phone,
        course: e.course.name,
        branch: e.branch.code,
        netFee: Number(e.netFee),
        status: e.status.toLowerCase().replace("_", " "),
      }));
    },
  },
  {
    key: "fee-collections",
    title: "Fee collections",
    description: "Fee receipts in the period (cancelled receipts left out), with payment mode.",
    group: "Students",
    permission: "fees.view",
    usesDates: true,
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "receipt", label: "Receipt", type: "text" },
      { key: "student", label: "Student", type: "text" },
      { key: "course", label: "Course", type: "text" },
      { key: "mode", label: "Mode", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "amount", label: "Amount", type: "money", total: true },
    ],
    run: async ({ orgId, c, f }) => {
      const rows = await db.feePayment.findMany({
        where: { organizationId: orgId, cancelledAt: null, paidAt: istRange(f), ...branchIn(c) },
        include: {
          enrollment: { include: { student: { select: { name: true } }, course: { select: { name: true } } } },
          paymentMode: { select: { name: true } },
          branch: { select: { code: true } },
        },
        orderBy: [{ paidAt: "asc" }],
      });
      return rows.map((p) => ({
        date: istDay(p.paidAt),
        receipt: p.receiptNo,
        student: p.enrollment.student.name,
        course: p.enrollment.course.name,
        mode: p.paymentMode.name,
        branch: p.branch.code,
        amount: Number(p.amount),
      }));
    },
  },
  {
    key: "fee-dues",
    title: "Fee dues",
    description: "Unpaid instalments due on or before the end date (dropped students left out).",
    group: "Students",
    permission: "fees.view",
    usesDates: true,
    columns: [
      { key: "student", label: "Student", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "course", label: "Course", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "instalment", label: "Instalment", type: "text" },
      { key: "dueDate", label: "Due on", type: "date" },
      { key: "daysOver", label: "Days overdue", type: "number" },
      { key: "due", label: "Due", type: "money", total: true },
    ],
    run: async ({ orgId, c, f }) => {
      const today = istDateOnly(new Date());
      const rows = await db.feeInstallment.findMany({
        where: {
          status: { in: ["DUE", "PARTIAL"] },
          dueDate: { lte: d(f.to) },
          enrollment: { organizationId: orgId, deletedAt: null, status: { not: "DROPPED" }, ...branchIn(c) },
        },
        include: { enrollment: { include: { student: true, course: { select: { name: true } }, branch: { select: { code: true } } } } },
        orderBy: [{ dueDate: "asc" }],
      });
      return rows.map((i) => ({
        student: i.enrollment.student.name,
        phone: i.enrollment.student.phone,
        course: i.enrollment.course.name,
        branch: i.enrollment.branch.code,
        instalment: i.label,
        dueDate: ymd(i.dueDate),
        daysOver: Math.max(0, Math.round((today.getTime() - i.dueDate.getTime()) / DAY)),
        due: round2(Number(i.amount) - Number(i.paidAmount)),
      }));
    },
  },
  {
    key: "attendance-shortfall",
    title: "Attendance below minimum",
    description: "Active students whose attendance is below the certificate minimum (Certificates → Rules).",
    group: "Students",
    permission: "students.view",
    usesDates: false,
    columns: [
      { key: "student", label: "Student", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "batch", label: "Batch", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "sessions", label: "Sessions", type: "number" },
      { key: "percent", label: "Attendance", type: "percent" },
    ],
    run: async ({ orgId, c }) => {
      const { minAttendance } = await getCertificateRules(orgId);
      const rows = await db.enrollment.findMany({
        where: { organizationId: orgId, deletedAt: null, status: { in: ["ACTIVE", "ON_HOLD"] }, ...branchIn(c) },
        include: {
          student: true,
          batch: { select: { name: true } },
          branch: { select: { code: true } },
          attendance: { select: { status: true } },
        },
      });
      return rows
        .map((e) => ({ e, pct: attendancePercent(e.attendance.map((a) => a.status)) }))
        .filter((x) => x.pct !== null && x.pct < minAttendance)
        .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
        .map(({ e, pct }) => ({
          student: e.student.name,
          phone: e.student.phone,
          batch: e.batch?.name ?? "—",
          branch: e.branch.code,
          sessions: e.attendance.length,
          percent: pct,
        }));
    },
  },
  {
    key: "job-cards",
    title: "Job cards",
    description: "Repairs received in the period: engineer, status and turnaround.",
    group: "Service",
    permission: "jobcards.view",
    usesDates: true,
    columns: [
      { key: "jobNo", label: "Job", type: "text" },
      { key: "received", label: "Received", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "device", label: "Device", type: "text" },
      { key: "engineer", label: "Engineer", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "delivered", label: "Delivered", type: "date" },
      { key: "tatDays", label: "Turnaround (days)", type: "number" },
    ],
    run: async ({ orgId, userId, c, f }) => {
      const rows = await db.jobCard.findMany({
        where: { organizationId: orgId, deletedAt: null, receivedAt: istRange(f), ...branchIn(c), ...(c.ownOnly ? { assignedEngineerId: userId } : {}) },
        include: {
          customer: { select: { name: true } },
          device: { include: { brand: { select: { name: true } }, model: { select: { name: true } }, deviceType: { select: { name: true } } } },
          assignedEngineer: { select: { name: true } },
          status: { select: { name: true } },
        },
        orderBy: [{ receivedAt: "asc" }],
      });
      return rows.map((j) => ({
        jobNo: j.jobNo,
        received: istDay(j.receivedAt),
        customer: j.customer.name,
        device: [j.device.brand?.name, j.device.model?.name ?? j.device.modelText].filter(Boolean).join(" ") || j.device.deviceType.name,
        engineer: j.assignedEngineer?.name ?? "—",
        status: j.status.name,
        delivered: j.deliveredAt ? istDay(j.deliveredAt) : null,
        tatDays: j.tatMinutes === null ? null : round2(j.tatMinutes / 1440),
      }));
    },
  },
  {
    key: "engineers",
    title: "Engineer performance",
    description:
      "Per engineer: jobs delivered in the period, average turnaround, service revenue before GST (invoices dated in the period) and comebacks (repeat jobs received in the period on devices they repaired).",
    group: "Service",
    permission: "jobcards.view",
    usesDates: true,
    columns: [
      { key: "engineer", label: "Engineer", type: "text" },
      { key: "delivered", label: "Delivered", type: "number", total: true },
      { key: "avgTat", label: "Avg turnaround (days)", type: "number" },
      { key: "revenue", label: "Revenue (before GST)", type: "money", total: true },
      { key: "comebacks", label: "Comebacks", type: "number", total: true },
      { key: "comebackPct", label: "Comeback %", type: "percent" },
    ],
    run: async ({ orgId, userId, c, f }) => {
      const base = { organizationId: orgId, deletedAt: null, assignedEngineerId: c.ownOnly ? userId : { not: null }, ...branchIn(c) };
      const [delivered, invoices, comebacks] = await Promise.all([
        db.jobCard.findMany({ where: { ...base, deliveredAt: istRange(f) }, select: { assignedEngineerId: true, tatMinutes: true } }),
        db.invoice.findMany({
          where: {
            organizationId: orgId,
            kind: { not: "CREDIT_NOTE" },
            cancelledAt: null,
            status: { not: "DRAFT" },
            invoiceDate: { gte: d(f.from), lte: d(f.to) },
            jobCard: { assignedEngineerId: c.ownOnly ? userId : { not: null } },
            ...branchIn(c),
          },
          select: { subtotal: true, discountTotal: true, jobCard: { select: { assignedEngineerId: true } } },
        }),
        db.jobCard.findMany({
          where: {
            organizationId: orgId,
            deletedAt: null,
            parentJobId: { not: null },
            receivedAt: istRange(f),
            ...branchIn(c),
            ...(c.ownOnly ? { parentJob: { assignedEngineerId: userId } } : {}),
          },
          select: { parentJob: { select: { assignedEngineerId: true } } },
        }),
      ]);
      const ids = new Set<string>([
        ...delivered.map((j) => j.assignedEngineerId!),
        ...invoices.map((i) => i.jobCard!.assignedEngineerId!),
        ...comebacks.map((j) => j.parentJob?.assignedEngineerId).filter((x): x is string => !!x),
      ]);
      const users = await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
      return users
        .map((u) => {
          const mine = delivered.filter((j) => j.assignedEngineerId === u.id);
          const tats = mine.map((j) => j.tatMinutes).filter((t): t is number => t !== null);
          const back = comebacks.filter((j) => j.parentJob?.assignedEngineerId === u.id).length;
          return {
            engineer: u.name,
            delivered: mine.length,
            avgTat: tats.length ? round2(tats.reduce((a, t) => a + t, 0) / tats.length / 1440) : null,
            revenue: round2(
              invoices.filter((i) => i.jobCard!.assignedEngineerId === u.id).reduce((a, i) => a + Number(i.subtotal) - Number(i.discountTotal), 0),
            ),
            comebacks: back,
            comebackPct: mine.length ? Math.round((back / mine.length) * 1000) / 10 : null,
          };
        })
        .sort((a, b) => String(a.engineer).localeCompare(String(b.engineer)));
    },
  },
  {
    key: "stock",
    title: "Stock valuation",
    description: "Current stock per branch at weighted average cost, with low-stock flags.",
    group: "Inventory",
    permission: "inventory.view",
    usesDates: false,
    columns: [
      { key: "sku", label: "SKU", type: "text" },
      { key: "part", label: "Part", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "qty", label: "Qty", type: "number" },
      { key: "avgCost", label: "Avg cost", type: "money" },
      { key: "value", label: "Value", type: "money", total: true },
      { key: "reorder", label: "Reorder at", type: "number" },
      { key: "low", label: "Low?", type: "text" },
    ],
    run: async ({ orgId, c }) => {
      const rows = await db.stock.findMany({
        where: { ...branchIn(c), part: { organizationId: orgId, deletedAt: null }, OR: [{ qty: { gt: 0 } }, { reorderLevel: { gt: 0 } }] },
        include: { part: { select: { sku: true, name: true, reorderLevel: true } }, branch: { select: { code: true } } },
        orderBy: [{ part: { name: "asc" } }],
      });
      return rows.map((s) => {
        const level = Number(s.reorderLevel ?? s.part.reorderLevel);
        return {
          sku: s.part.sku,
          part: s.part.name,
          branch: s.branch.code,
          qty: Number(s.qty),
          avgCost: Number(s.avgCost),
          value: round2(Number(s.qty) * Number(s.avgCost)),
          reorder: level || null,
          low: level > 0 && Number(s.qty) <= level ? "yes" : "",
        };
      });
    },
  },
  {
    key: "placements",
    title: "Placements",
    description: "Offers made in the period: company, role, salary and joining status.",
    group: "Placements",
    permission: "placements.view",
    usesDates: true,
    columns: [
      { key: "date", label: "Offer date", type: "date" },
      { key: "student", label: "Student", type: "text" },
      { key: "course", label: "Course", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "company", label: "Company", type: "text" },
      { key: "designation", label: "Designation", type: "text" },
      { key: "ctc", label: "CTC / year", type: "money" },
      { key: "joining", label: "Joining", type: "text" },
    ],
    run: async ({ orgId, c, f }) => {
      const rows = await db.placementOffer.findMany({
        where: {
          offeredAt: { gte: d(f.from), lte: d(f.to) },
          application: { drive: { organizationId: orgId }, ...(c.branchIds === null ? {} : { enrollment: { branchId: { in: c.branchIds } } }) },
        },
        include: {
          application: {
            include: {
              student: { select: { name: true } },
              drive: { include: { company: { select: { name: true } } } },
              enrollment: { include: { course: { select: { name: true } }, branch: { select: { code: true } } } },
            },
          },
        },
        orderBy: [{ offeredAt: "asc" }],
      });
      return rows.map((o) => ({
        date: ymd(o.offeredAt),
        student: o.application.student.name,
        course: o.application.enrollment?.course.name ?? "—",
        branch: o.application.enrollment?.branch.code ?? "—",
        company: o.application.drive.company.name,
        designation: o.designation,
        ctc: o.ctcAnnual === null ? null : Number(o.ctcAnnual),
        joining: o.joiningStatus === "PENDING" ? "joining" : o.joiningStatus.toLowerCase(),
      }));
    },
  },
];

export function findReport(key: string) {
  return REPORTS.find((r) => r.key === key) ?? null;
}

/** Default period: this month so far (IST). */
export function defaultFilters(): Filters {
  const today = istDateOnly(new Date());
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { from: ymd(from)!, to: ymd(today)!, branchId: null };
}

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const def = defaultFilters();
  const pick = (k: string) => (typeof sp[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp[k] as string) ? (sp[k] as string) : null);
  let from = pick("from") ?? def.from;
  let to = pick("to") ?? def.to;
  if (from > to) [from, to] = [to, from];
  const branchId = typeof sp.branch === "string" && sp.branch ? sp.branch : null;
  return { from, to, branchId };
}

/** Runs a report for a user: their branches (or one picked branch they can access). Null when not allowed. */
export async function runReport(user: CurrentUser, report: ReportDef, f: Filters) {
  if (f.branchId && !canAccessBranch(user.access, report.permission, f.branchId)) return null;
  const c = branchConstraint(user.access, report.permission, f.branchId);
  if (c.branchIds !== null && c.branchIds.length === 0) return null;
  const rows = await report.run({ orgId: user.organizationId, userId: user.id, c, f });
  const totals: Row = {};
  for (const col of report.columns)
    if (col.total) totals[col.key] = round2(rows.reduce((a, r) => a + (typeof r[col.key] === "number" ? (r[col.key] as number) : 0), 0));
  return { rows, totals };
}
