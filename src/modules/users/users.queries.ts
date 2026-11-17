import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint } from "@/modules/rbac/access";

export const USER_SORTS = ["name", "email", "lastLoginAt"] as const;

export async function listUsers(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "users.view", activeBranchId);
  const where: Prisma.UserWhereInput = {
    organizationId: user.organizationId,
    deletedAt: p.showDeleted ? { not: null } : null,
    ...(scope.branchIds ? { branches: { some: { branchId: { in: scope.branchIds } } } } : {}),
    ...(p.filters.role ? { roles: { some: { roleId: p.filters.role } } } : {}),
    ...(p.filters.status === "active"
      ? { isActive: true }
      : p.filters.status === "inactive"
        ? { isActive: false }
        : {}),
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" } },
            { email: { contains: p.q, mode: "insensitive" } },
            { phone: { contains: p.q } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        deletedAt: true,
        roles: { select: { roleId: true, scope: true, role: { select: { name: true } } } },
        branches: { select: { branchId: true, branch: { select: { code: true } } } },
      },
      orderBy: p.sort ? { [p.sort]: p.dir } : { name: "asc" },
      ...paging(p),
    }),
    db.user.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      deleted: !!u.deletedAt,
      isSelf: u.id === user.id,
      roleNames: u.roles.map((r) => r.role.name),
      branchCodes: u.branches.map((b) => b.branch.code),
      form: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? "",
        password: "",
        isActive: u.isActive,
        roles: u.roles.map((r) => ({ roleId: r.roleId, scope: r.scope })),
        branchIds: u.branches.map((b) => b.branchId),
      },
    })),
  };
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>["rows"][number];

/** Roles and branches offered in the user form. */
export async function userFormOptions(user: CurrentUser) {
  const [roles, branches] = await Promise.all([
    db.role.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true, permissions: { select: { permission: { select: { key: true } } } } },
      orderBy: { name: "asc" },
    }),
    db.branch.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const own = user.access.permissions;
  return {
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      // Roles with permissions the current user lacks can't be assigned by them.
      grantable: r.permissions.every((p) => own.has(p.permission.key as never)),
    })),
    branches: branches
      .filter((b) => user.access.canSeeAllBranches || user.access.assignedBranchIds.includes(b.id))
      .map((b) => ({ id: b.id, label: `${b.name} (${b.code})` })),
  };
}
