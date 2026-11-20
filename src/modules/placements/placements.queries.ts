import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/modules/auth/current";
import { placementStat, type PlacementEnrollment } from "@/modules/academics/academic-logic";
import { branchConstraint, canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { eligibleEnrollmentWhere } from "./placements.service";

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ------------------------------------------------------------------ companies

export async function listCompanies(user: CurrentUser, q: string | null) {
  const rows = await db.company.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: {
      contacts: true,
      drives: {
        where: { deletedAt: null },
        select: { id: true, applications: { select: { offer: { select: { joiningStatus: true } } } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    website: c.website,
    city: c.city,
    address: c.address,
    isActive: c.isActive,
    showOnWebsite: c.showOnWebsite,
    contacts: c.contacts.map((x) => ({ name: x.name, designation: x.designation, phone: x.phone, email: x.email })),
    drives: c.drives.length,
    hired: c.drives.flatMap((d) => d.applications).filter((a) => a.offer && a.offer.joiningStatus !== "DECLINED")
      .length,
  }));
}
export type CompanyRow = Awaited<ReturnType<typeof listCompanies>>[number];

export async function driveFormOptions(user: CurrentUser) {
  const orgId = user.organizationId;
  const [companies, courses, branches] = await Promise.all([
    db.company.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { name: "asc" } }),
    db.branch.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return {
    companies: companies.map((c) => ({ value: c.id, label: c.name })),
    courses: courses.map((c) => ({ value: c.id, label: c.name })),
    branches: branches
      .filter((b) => canAccessBranch(user.access, "placements.manage_drives", b.id))
      .map((b) => ({ value: b.id, label: b.name })),
    allBranches: scopeOf(user.access, "placements.manage_drives") === "ALL_BRANCHES",
  };
}

// ------------------------------------------------------------------ drives

/** Drives the user can see: their branches' drives plus drives open to every branch. */
function driveScope(user: CurrentUser, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "placements.view", activeBranchId);
  return c.branchIds === null ? {} : { OR: [{ branchId: null }, { branchId: { in: c.branchIds } }] };
}

export async function listDrives(user: CurrentUser, opts: { activeBranchId: string | null; status: string | null }) {
  const rows = await db.placementDrive.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...driveScope(user, opts.activeBranchId),
      ...(opts.status === "OPEN" || opts.status === "CLOSED" || opts.status === "CANCELLED"
        ? { status: opts.status }
        : {}),
    },
    include: {
      company: { select: { name: true } },
      branch: { select: { name: true } },
      courses: { include: { course: { select: { code: true } } } },
      applications: { select: { status: true, offer: { select: { joiningStatus: true } } } },
    },
    orderBy: [{ driveDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    jobRole: d.jobRole,
    company: d.company.name,
    branch: d.branch?.name ?? "All branches",
    courses: d.courses.map((c) => c.course.code).join(", ") || "Any course",
    driveDate: ymd(d.driveDate),
    status: d.status,
    applicants: d.applications.length,
    placed: d.applications.filter((a) => a.offer && a.offer.joiningStatus !== "DECLINED").length,
  }));
}
export type DriveRow = Awaited<ReturnType<typeof listDrives>>[number];

export async function getDrive(user: CurrentUser, id: string) {
  const d = await db.placementDrive.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null, ...driveScope(user, null) },
    include: {
      company: { include: { contacts: true } },
      branch: { select: { id: true, name: true } },
      courses: { include: { course: { select: { id: true, name: true, code: true } } } },
      applications: {
        include: {
          student: { select: { id: true, name: true, studentCode: true, phone: true, branchId: true } },
          enrollment: {
            select: {
              id: true,
              branchId: true,
              status: true,
              course: { select: { code: true } },
              branch: { select: { code: true } },
            },
          },
          rounds: { orderBy: { roundNo: "asc" } },
          offer: true,
        },
        orderBy: { appliedAt: "asc" },
      },
    },
  });
  if (!d) return null;
  const eligible = await db.enrollment.findMany({
    where: { ...eligibleEnrollmentWhere(d), studentId: { notIn: d.applications.map((a) => a.studentId) } },
    include: {
      student: { select: { name: true, studentCode: true } },
      course: { select: { code: true } },
      branch: { select: { code: true } },
      applications: { where: { offer: { joiningStatus: { not: "DECLINED" } } }, select: { id: true } },
    },
    orderBy: [{ status: "asc" }, { student: { name: "asc" } }],
    take: 300,
  });
  return {
    id: d.id,
    title: d.title,
    jobRole: d.jobRole,
    description: d.description,
    location: d.location,
    salaryMin: num(d.salaryMin),
    salaryMax: num(d.salaryMax),
    driveDate: ymd(d.driveDate),
    lastDateToApply: ymd(d.lastDateToApply),
    status: d.status,
    company: { id: d.company.id, name: d.company.name, contacts: d.company.contacts },
    companyId: d.companyId,
    branchId: d.branchId,
    branch: d.branch?.name ?? "All branches",
    courses: d.courses.map((c) => c.course),
    canManageDrive: d.branchId
      ? canAccessBranch(user.access, "placements.manage_drives", d.branchId)
      : scopeOf(user.access, "placements.manage_drives") === "ALL_BRANCHES",
    applications: d.applications.map((a) => ({
      id: a.id,
      studentId: a.student.id,
      student: a.student.name,
      studentCode: a.student.studentCode,
      phone: a.student.phone,
      course: a.enrollment?.course.code ?? "",
      branchCode: a.enrollment?.branch.code ?? "",
      status: a.status,
      notes: a.notes,
      canManage: canAccessBranch(
        user.access,
        "placements.manage_applications",
        a.enrollment?.branchId ?? a.student.branchId,
      ),
      rounds: a.rounds.map((r) => ({
        id: r.id,
        roundNo: r.roundNo,
        name: r.name,
        scheduledAt: ymd(r.scheduledAt),
        result: r.result,
        remarks: r.remarks,
      })),
      offer: a.offer
        ? {
            offeredAt: ymd(a.offer.offeredAt)!,
            designation: a.offer.designation,
            ctcAnnual: num(a.offer.ctcAnnual),
            joiningDate: ymd(a.offer.joiningDate),
            joiningStatus: a.offer.joiningStatus,
          }
        : null,
    })),
    eligible: eligible
      .filter((e) => canAccessBranch(user.access, "placements.manage_applications", e.branchId))
      .map((e) => ({
        enrollmentId: e.id,
        student: e.student.name,
        studentCode: e.student.studentCode,
        course: e.course.code,
        branchCode: e.branch.code,
        status: e.status,
        alreadyPlaced: e.applications.length > 0,
      })),
  };
}
export type DriveDetail = NonNullable<Awaited<ReturnType<typeof getDrive>>>;

// ------------------------------------------------------------------ stats

type StatRow = { key: string; label: string; sub?: string } & ReturnType<typeof placementStat>;

async function placementEnrollments(orgId: string, branchIds: string[] | null) {
  const rows = await db.enrollment.findMany({
    where: { organizationId: orgId, deletedAt: null, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: {
      status: true,
      placementOptOut: true,
      branch: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      applications: { where: { offer: { joiningStatus: { not: "DECLINED" } } }, select: { id: true } },
    },
  });
  return rows.map((r) => ({ ...r, placed: r.applications.length > 0 }));
}

function groupStats<T extends PlacementEnrollment>(
  list: T[],
  keyOf: (e: T) => { key: string; label: string; sub?: string } | null,
): StatRow[] {
  const groups = new Map<string, { label: string; sub?: string; items: T[] }>();
  for (const e of list) {
    const k = keyOf(e);
    if (!k) continue;
    const g = groups.get(k.key) ?? { label: k.label, sub: k.sub, items: [] };
    g.items.push(e);
    groups.set(k.key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, sub: g.sub, ...placementStat(g.items) }))
    .filter((r) => r.completed > 0 || r.placed > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function placementStats(user: CurrentUser, activeBranchId: string | null) {
  const c = branchConstraint(user.access, "placements.view", activeBranchId);
  const list = await placementEnrollments(user.organizationId, c.branchIds);
  return {
    overall: placementStat(list),
    byBranch: groupStats(list, (e) => ({ key: e.branch.id, label: e.branch.name })),
    byCourse: groupStats(list, (e) => ({ key: e.course.id, label: e.course.name })),
    byBatch: groupStats(list, (e) => (e.batch ? { key: e.batch.id, label: e.batch.name, sub: e.course.name } : null)),
  };
}

/** For the public site: the overall figures and the companies that hired. */
export async function publicPlacementStats(orgId: string) {
  const list = await placementEnrollments(orgId, null);
  return placementStat(list);
}
