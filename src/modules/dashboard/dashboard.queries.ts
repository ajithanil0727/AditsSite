import "server-only";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import type { PermissionKey } from "@/lib/permissions";
import type { CurrentUser } from "@/modules/auth/current";
import { placementStat } from "@/modules/academics/academic-logic";
import { branchConstraint, can, type BranchConstraint } from "@/modules/rbac/access";
import { listShelf, myOpenJobs } from "@/modules/service/jobs.queries";

/**
 * Role-based dashboard: each widget appears only for people with its permission, scoped to their branches
 * (or the branch picked in the switcher). Money in rupees.
 */
const DAY = 86_400_000;
const inBranches = (c: BranchConstraint, field = "branchId") =>
  c.branchIds === null ? {} : { [field]: { in: c.branchIds } };
const sum = (rows: { amount: unknown }[]) => rows.reduce((a, r) => a + Number(r.amount), 0);

export type Tile = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  href: string;
  tone: "mint" | "sky" | "peach" | "lavender" | "danger";
};
export type ListWidget = {
  key: string;
  title: string;
  href: string;
  empty: string;
  items: { id: string; label: string; sub: string; href: string; badge?: string }[];
};

export async function dashboardData(user: CurrentUser, activeBranchId: string | null) {
  const orgId = user.organizationId;
  const scope = (p: PermissionKey) => (can(user.access, p) ? branchConstraint(user.access, p, activeBranchId) : null);
  const today = istDateOnly(new Date());
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const tomorrow = new Date(today.getTime() + DAY);
  // Times stored as UTC instants: IST day = UTC −5:30.
  const istStart = (d: Date) => new Date(d.getTime() - 330 * 60_000);
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  const tiles: Tile[] = [];
  const lists: ListWidget[] = [];

  // --- Admissions & collections & dues ---
  const students = scope("students.view");
  if (students) {
    const admissions = await db.enrollment.count({
      where: { organizationId: orgId, deletedAt: null, enrolledAt: { gte: monthStart }, ...inBranches(students) },
    });
    tiles.push({
      key: "admissions",
      label: "Admissions this month",
      value: String(admissions),
      href: "/admin/students",
      tone: "lavender",
    });
  }
  const fees = scope("fees.view");
  if (fees) {
    const [todayRows, monthRows, overdue] = await Promise.all([
      db.feePayment.findMany({
        where: {
          organizationId: orgId,
          cancelledAt: null,
          paidAt: { gte: istStart(today), lt: istStart(tomorrow) },
          ...inBranches(fees),
        },
        select: { amount: true },
      }),
      db.feePayment.findMany({
        where: { organizationId: orgId, cancelledAt: null, paidAt: { gte: istStart(monthStart) }, ...inBranches(fees) },
        select: { amount: true },
      }),
      db.feeInstallment.findMany({
        where: {
          status: { in: ["DUE", "PARTIAL"] },
          dueDate: { lt: today },
          enrollment: { organizationId: orgId, deletedAt: null, status: { not: "DROPPED" }, ...inBranches(fees) },
        },
        select: { amount: true, paidAmount: true, enrollmentId: true },
      }),
    ]);
    const overdueAmt = overdue.reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0);
    tiles.push(
      {
        key: "fees-today",
        label: "Fees collected today",
        value: inr(sum(todayRows)),
        hint: `${inr(sum(monthRows))} this month`,
        href: "/admin/fees/payments",
        tone: "mint",
      },
      {
        key: "dues",
        label: "Overdue fees",
        value: inr(overdueAmt),
        hint: `${new Set(overdue.map((o) => o.enrollmentId)).size} students`,
        href: "/admin/fees/dues",
        tone: overdueAmt > 0 ? "danger" : "mint",
      },
    );
  }

  // --- Enquiries: follow-ups due ---
  const leads = scope("leads.view");
  if (leads) {
    const where = {
      organizationId: orgId,
      deletedAt: null,
      status: { isWon: false, isLost: false },
      nextFollowUpAt: { lt: istStart(tomorrow) },
      ...inBranches(leads),
      ...(leads.ownOnly ? { assignedToId: user.id } : {}),
    };
    const [count, due] = await Promise.all([
      db.lead.count({ where }),
      db.lead.findMany({
        where,
        orderBy: { nextFollowUpAt: "asc" },
        take: 6,
        select: { id: true, name: true, phone: true, nextFollowUpAt: true },
      }),
    ]);
    tiles.push({
      key: "followups",
      label: "Follow-ups due",
      value: String(count),
      href: "/admin/leads/follow-ups",
      tone: count ? "peach" : "mint",
    });
    lists.push({
      key: "followups",
      title: "Follow-ups due",
      href: "/admin/leads/follow-ups",
      empty: "No follow-ups due today.",
      items: due.map((l) => ({
        id: l.id,
        label: l.name,
        sub: l.phone,
        href: `/admin/leads/${l.id}`,
        badge: l.nextFollowUpAt && l.nextFollowUpAt < istStart(today) ? "overdue" : "today",
      })),
    });
  }

  // --- Service: open job cards and overdue turnaround ---
  const jobs = scope("jobcards.view");
  if (jobs) {
    const own = jobs.ownOnly ? { assignedEngineerId: user.id } : {};
    const open = {
      organizationId: orgId,
      deletedAt: null,
      status: { systemKey: { notIn: ["DELIVERED" as const, "CANCELLED" as const] } },
      ...inBranches(jobs),
      ...own,
    };
    const [openCount, ready, late] = await Promise.all([
      db.jobCard.count({ where: open }),
      db.jobCard.count({ where: { ...open, status: { systemKey: "READY" as const } } }),
      db.jobCard.findMany({
        where: {
          ...open,
          status: { systemKey: { notIn: ["DELIVERED" as const, "CANCELLED" as const, "READY" as const] } },
          estimatedAt: { lt: new Date() },
        },
        orderBy: { estimatedAt: "asc" },
        take: 6,
        select: {
          id: true,
          jobNo: true,
          estimatedAt: true,
          customer: { select: { name: true } },
          status: { select: { name: true } },
        },
      }),
    ]);
    const lateCount = await db.jobCard.count({
      where: {
        ...open,
        status: { systemKey: { notIn: ["DELIVERED" as const, "CANCELLED" as const, "READY" as const] } },
        estimatedAt: { lt: new Date() },
      },
    });
    tiles.push(
      {
        key: "jobs-open",
        label: "Open job cards",
        value: String(openCount),
        hint: `${ready} ready for pickup`,
        href: "/admin/service/jobs",
        tone: "sky",
      },
      {
        key: "jobs-late",
        label: "Past promised date",
        value: String(lateCount),
        href: "/admin/service/jobs",
        tone: lateCount ? "danger" : "mint",
      },
    );
    lists.push({
      key: "late-jobs",
      title: "Past promised date",
      href: "/admin/service/jobs",
      empty: "Every open job is on time.",
      items: late.map((j) => ({
        id: j.id,
        label: `${j.jobNo} · ${j.customer.name}`,
        sub: `${j.status.name} · promised ${j.estimatedAt ? j.estimatedAt.toISOString().slice(0, 10).split("-").reverse().join("/") : ""}`,
        href: `/admin/service/jobs/${j.id}`,
      })),
    });
  }

  // --- Engineers: my jobs + the shelf (jobs without an engineer they can take) ---
  if (jobs?.ownOnly) {
    const mine = await myOpenJobs(user);
    lists.unshift({
      key: "my-jobs",
      title: `My jobs (${mine.length})`,
      href: "/admin/service/jobs",
      empty: "No open jobs. Take one from the shelf.",
      items: mine.slice(0, 8).map((j) => ({
        id: j.id,
        label: `${j.jobNo} · ${j.device}`,
        sub: `${j.status}${j.estimatedAt ? ` · promised ${j.estimatedAt.slice(0, 10).split("-").reverse().join("/")}` : ""}${j.priority === "URGENT" || j.priority === "HIGH" ? ` · ${j.priority.toLowerCase()}` : ""}`,
        href: `/admin/service/jobs/${j.id}`,
        badge: j.overdue ? "overdue" : undefined,
      })),
    });
  }
  if (can(user.access, "jobcards.self_assign")) {
    const shelf = await listShelf(user, activeBranchId);
    tiles.push({ key: "shelf", label: "On the shelf", value: String(shelf.length), hint: "jobs waiting for an engineer", href: "/admin/service/shelf", tone: shelf.length ? "peach" : "mint" });
    if (jobs?.ownOnly)
      lists.splice(1, 0, {
        key: "shelf",
        title: "On the shelf",
        href: "/admin/service/shelf",
        empty: "Nothing waiting. Every job has an engineer.",
        items: shelf.slice(0, 6).map((j) => ({
          id: j.id,
          label: `${j.jobNo} · ${j.device}`,
          sub: j.problem,
          href: "/admin/service/shelf",
          badge: j.priority === "URGENT" ? "urgent" : undefined,
        })),
      });
  }

  // --- Stock alerts ---
  const stock = scope("inventory.view");
  if (stock) {
    const rows = await db.stock.findMany({
      where: { ...inBranches(stock), part: { organizationId: orgId, deletedAt: null, isActive: true } },
      select: {
        id: true,
        qty: true,
        reorderLevel: true,
        part: { select: { id: true, name: true, sku: true, reorderLevel: true } },
        branch: { select: { code: true } },
      },
    });
    const low = rows.filter((r) => {
      const level = Number(r.reorderLevel ?? r.part.reorderLevel);
      return level > 0 && Number(r.qty) <= level;
    });
    tiles.push({
      key: "stock",
      label: "Parts at or below reorder level",
      value: String(low.length),
      href: "/admin/inventory/stock",
      tone: low.length ? "peach" : "mint",
    });
    lists.push({
      key: "stock",
      title: "Low stock",
      href: "/admin/inventory/stock",
      empty: "No parts are low.",
      items: low.slice(0, 6).map((r) => ({
        id: r.id,
        label: r.part.name,
        sub: `${r.part.sku} · ${r.branch.code} · ${Number(r.qty)} left (reorder at ${Number(r.reorderLevel ?? r.part.reorderLevel)})`,
        href: `/admin/inventory/stock?q=${encodeURIComponent(r.part.sku)}`,
      })),
    });
  }

  // --- Placements ---
  const placements = scope("placements.view");
  if (placements) {
    const rows = await db.enrollment.findMany({
      where: { organizationId: orgId, deletedAt: null, ...inBranches(placements) },
      select: {
        status: true,
        placementOptOut: true,
        applications: { where: { offer: { joiningStatus: { not: "DECLINED" } } }, select: { id: true } },
      },
    });
    const s = placementStat(
      rows.map((r) => ({ status: r.status, placementOptOut: r.placementOptOut, placed: r.applications.length > 0 })),
    );
    tiles.push({
      key: "placements",
      label: "Placement %",
      value: s.percent === null ? "—" : `${s.percent}%`,
      hint: `${s.placed} of ${s.optedIn} placed`,
      href: "/admin/placements/stats",
      tone: "lavender",
    });
  }

  // --- Things waiting for me ---
  const approvals: ListWidget["items"] = [];
  if (can(user.access, "fees.discount_approve")) {
    const n = await db.discountRequest.count({
      where: {
        status: "PENDING",
        enrollment: {
          organizationId: orgId,
          ...inBranches(branchConstraint(user.access, "fees.discount_approve", activeBranchId)),
        },
      },
    });
    if (n)
      approvals.push({
        id: "discounts",
        label: `${n} discount request(s)`,
        sub: "Fees",
        href: "/admin/fees/approvals",
      });
  }
  if (can(user.access, "fees.refund_approve")) {
    const n = await db.feeRefund.count({
      where: {
        status: "PENDING",
        enrollment: {
          organizationId: orgId,
          ...inBranches(branchConstraint(user.access, "fees.refund_approve", activeBranchId)),
        },
      },
    });
    if (n)
      approvals.push({ id: "refunds", label: `${n} refund request(s)`, sub: "Fees", href: "/admin/fees/approvals" });
  }
  if (can(user.access, "expenses.approve")) {
    const n = await db.expense.count({
      where: {
        organizationId: orgId,
        status: "PENDING",
        ...inBranches(branchConstraint(user.access, "expenses.approve", activeBranchId)),
      },
    });
    if (n)
      approvals.push({
        id: "expenses",
        label: `${n} expense(s) to approve`,
        sub: "Accounts",
        href: "/admin/accounts/expenses?f_status=PENDING",
      });
  }
  if (can(user.access, "leaves.approve")) {
    const n = await db.leaveRequest.count({
      where: {
        status: "PENDING",
        employee: {
          organizationId: orgId,
          ...inBranches(branchConstraint(user.access, "leaves.approve", activeBranchId)),
        },
      },
    });
    if (n)
      approvals.push({
        id: "leave",
        label: `${n} leave request(s)`,
        sub: "HR",
        href: "/admin/hr/leave?f_status=PENDING",
      });
  }
  if (can(user.access, "incentives.approve")) {
    const n = await db.incentive.count({
      where: {
        status: "PENDING",
        employee: {
          organizationId: orgId,
          ...inBranches(branchConstraint(user.access, "incentives.approve", activeBranchId)),
        },
      },
    });
    if (n)
      approvals.push({
        id: "incentives",
        label: `${n} incentive(s) to approve`,
        sub: "HR",
        href: "/admin/hr/incentives",
      });
  }
  if (can(user.access, "certificates.issue")) {
    const n = await db.enrollment.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: "COMPLETED",
        certificates: { none: { status: "ISSUED" } },
        ...inBranches(branchConstraint(user.access, "certificates.issue", activeBranchId)),
      },
    });
    if (n)
      approvals.push({
        id: "certificates",
        label: `${n} completed student(s) without a certificate`,
        sub: "Certificates",
        href: "/admin/certificates",
      });
  }
  if (approvals.length || tiles.length)
    lists.unshift({
      key: "waiting",
      title: "Waiting for you",
      href: "/admin",
      empty: "Nothing is waiting for you.",
      items: approvals,
    });

  return { tiles, lists };
}
