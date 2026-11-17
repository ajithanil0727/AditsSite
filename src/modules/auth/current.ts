import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions";
import { buildAccess, can, selectableBranchIds, type Access } from "@/modules/rbac/access";

export const ACTIVE_BRANCH_COOKIE = "active_branch";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  organizationId: string;
  access: Access;
};

/** The logged-in, active user with resolved permissions, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await db.user.findFirst({
    where: { id: session.user.id, deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      organizationId: true,
      roles: {
        where: { role: { deletedAt: null } },
        select: {
          scope: true,
          role: {
            select: {
              discountLimitPercent: true,
              discountLimitAmount: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
      branches: {
        where: { branch: { deletedAt: null, isActive: true } },
        select: { branchId: true },
      },
    },
  });
  if (!user) return null;

  const access = buildAccess({
    userId: user.id,
    organizationId: user.organizationId,
    assignedBranchIds: user.branches.map((b) => b.branchId),
    roles: user.roles.map((r) => ({
      scope: r.scope,
      permissions: r.role.permissions.map((p) => p.permission.key),
      discountLimitPercent: r.role.discountLimitPercent.toNumber(),
      discountLimitAmount: r.role.discountLimitAmount.toNumber(),
    })),
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    organizationId: user.organizationId,
    access,
  };
});

/** For pages/layouts: redirect to /login when not signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirect to the "no access" page when the permission is missing. */
export async function requirePagePermission(permission: PermissionKey): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.access, permission)) redirect("/admin/no-access");
  return user;
}

export type BranchOption = { id: string; code: string; name: string };

/** Branches the user may choose in the switcher (active, non-deleted, non head-office included). */
export const getSelectableBranches = cache(async (user: CurrentUser): Promise<BranchOption[]> => {
  const branches = await db.branch.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const allowed = new Set(
    selectableBranchIds(
      user.access,
      branches.map((b) => b.id),
    ),
  );
  return branches.filter((b) => allowed.has(b.id));
});

/**
 * The branch picked in the top-bar switcher, validated against what the user may see.
 * null = "All branches" (or "All my branches" for branch-limited users).
 */
export const getActiveBranchId = cache(async (user: CurrentUser): Promise<string | null> => {
  const value = (await cookies()).get(ACTIVE_BRANCH_COOKIE)?.value;
  if (!value || value === "all") return null;
  const branches = await getSelectableBranches(user);
  return branches.some((b) => b.id === value) ? value : null;
});

/** Client IP and user agent for the audit log. */
export async function getRequestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ipAddress: ip, userAgent: h.get("user-agent") };
}
