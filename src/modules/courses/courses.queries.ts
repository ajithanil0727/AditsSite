import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, branchWhere, canAccessBranch, scopeOf } from "@/modules/rbac/access";

export async function listCourses(user: CurrentUser, p: ListParams) {
  const where: Prisma.CourseWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(p.filters.status === "inactive" ? { isActive: false } : p.filters.status === "all" ? {} : { isActive: true }),
    ...(p.q
      ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { code: { contains: p.q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.course.findMany({
      where,
      include: {
        _count: {
          select: {
            batches: { where: { deletedAt: null, status: { in: ["PLANNED", "ONGOING"] } } },
            enrollments: { where: { status: "ACTIVE", deletedAt: null } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      ...paging(p),
    }),
    db.course.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      duration: `${c.durationValue} ${c.durationUnit.toLowerCase()}`,
      fee: Number(c.fee),
      gstMode: c.gstMode,
      openBatches: c._count.batches,
      activeStudents: c._count.enrollments,
      isActive: c.isActive,
      showOnWebsite: c.showOnWebsite,
    })),
  };
}
export type CourseRow = Awaited<ReturnType<typeof listCourses>>["rows"][number];

export async function getCourse(organizationId: string, id: string) {
  return db.course.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      modules: { orderBy: { sortOrder: "asc" } },
      feePlans: { include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { name: "asc" } },
      taxRate: { select: { name: true } },
    },
  });
}

export async function courseFormOptions(organizationId: string) {
  const [rates, sac] = await Promise.all([
    db.taxRate.findMany({ where: { organizationId, isActive: true }, orderBy: { rate: "asc" } }),
    db.hsnSac.findMany({ where: { organizationId, isActive: true, isService: true }, orderBy: { code: "asc" } }),
  ]);
  return {
    rates: rates.map((r) => ({ value: r.id, label: r.name })),
    sac: sac.map((s) => ({ value: s.id, label: `${s.code} · ${s.description}` })),
  };
}

/** Active courses with fee plans, for admission and batch forms. */
export async function courseOptions(organizationId: string) {
  const courses = await db.course.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    include: { feePlans: { where: { isActive: true }, include: { items: { orderBy: { sortOrder: "asc" } } } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return courses.map((c) => ({
    value: c.id,
    label: `${c.name} (${c.code})`,
    fee: Number(c.fee),
    gstMode: c.gstMode,
    plans: c.feePlans.map((p) => ({
      value: p.id,
      label: p.name,
      items: p.items.map((i) => ({
        label: i.label,
        percentOfFee: Number(i.percentOfFee),
        dueAfterDays: i.dueAfterDays,
      })),
    })),
  }));
}
export type CourseOption = Awaited<ReturnType<typeof courseOptions>>[number];

// ---------------------------------------------------------------- batches

/** Trainers see only their own batches (OWN scope on batches.view). */
export function batchScopeWhere(user: CurrentUser, activeBranchId: string | null): Prisma.BatchWhereInput {
  const c = branchConstraint(user.access, "batches.view", activeBranchId);
  return {
    organizationId: user.organizationId,
    deletedAt: null,
    ...branchWhere(c),
    ...(c.ownOnly ? { trainerId: user.id } : {}),
  };
}

export async function listBatches(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const where: Prisma.BatchWhereInput = {
    ...batchScopeWhere(user, activeBranchId),
    ...(p.filters.status ? { status: p.filters.status as never } : { status: { in: ["PLANNED", "ONGOING"] } }),
    ...(p.filters.course ? { courseId: p.filters.course } : {}),
    ...(p.q
      ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { code: { contains: p.q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.batch.findMany({
      where,
      include: {
        course: { select: { name: true, code: true } },
        branch: { select: { code: true } },
        trainer: { select: { name: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE", deletedAt: null } } } },
      },
      orderBy: { startDate: "desc" },
      ...paging(p),
    }),
    db.batch.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      course: b.course.name,
      branchCode: b.branch.code,
      trainer: b.trainer?.name ?? null,
      startDate: b.startDate.toISOString(),
      timing: b.timing,
      days: b.days,
      students: b._count.enrollments,
      capacity: b.capacity,
      status: b.status,
    })),
  };
}
export type BatchRow = Awaited<ReturnType<typeof listBatches>>["rows"][number];

export async function getBatch(user: CurrentUser, id: string) {
  const b = await db.batch.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      course: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
      enrollments: {
        where: { deletedAt: null },
        include: { student: { select: { id: true, name: true, studentCode: true, phone: true } } },
        orderBy: { student: { name: "asc" } },
      },
      sessions: { include: { records: true, takenBy: { select: { name: true } } }, orderBy: { date: "desc" } },
    },
  });
  if (!b) return null;
  if (!canAccessBranch(user.access, "batches.view", b.branchId)) return null;
  if (scopeOf(user.access, "batches.view") === "OWN" && b.trainerId !== user.id) return null;
  return b;
}

/** Batches students can join (planned/ongoing, with capacity), per branch. */
export async function batchOptions(organizationId: string, branchIds: string[]) {
  const batches = await db.batch.findMany({
    where: { organizationId, deletedAt: null, branchId: { in: branchIds }, status: { in: ["PLANNED", "ONGOING"] } },
    include: { _count: { select: { enrollments: { where: { status: "ACTIVE", deletedAt: null } } } } },
    orderBy: { startDate: "asc" },
  });
  return batches.map((b) => ({
    value: b.id,
    label: `${b.name} · ${b.timing} (${b._count.enrollments}/${b.capacity})`,
    courseId: b.courseId,
    branchId: b.branchId,
    full: b._count.enrollments >= b.capacity,
  }));
}

export async function trainerOptions(organizationId: string, branchIds: string[] | null) {
  const users = await db.user.findMany({
    where: {
      organizationId,
      isActive: true,
      deletedAt: null,
      ...(branchIds ? { branches: { some: { branchId: { in: branchIds } } } } : {}),
      roles: {
        some: { role: { deletedAt: null, permissions: { some: { permission: { key: "student_attendance.mark" } } } } },
      },
    },
    select: { id: true, name: true, branches: { select: { branchId: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ value: u.id, label: u.name, branchIds: u.branches.map((b) => b.branchId) }));
}
