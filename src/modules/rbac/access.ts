/**
 * Pure access-resolution logic (no DB, no Next): easy to unit test.
 *
 * Rules
 * - Effective permissions = union of all the user's roles.
 * - For a permission granted by several roles, the WIDEST scope wins.
 * - OWN and ASSIGNED_BRANCHES are limited to the user's assigned branches.
 *   OWN additionally limits rows to those the user is responsible for (caller adds that filter).
 */
import type { RoleScope } from "@/generated/prisma/enums";
import type { PermissionKey } from "@/lib/permissions";

export const SCOPE_RANK: Record<RoleScope, number> = { OWN: 0, ASSIGNED_BRANCHES: 1, ALL_BRANCHES: 2 };

export type Access = {
  userId: string;
  organizationId: string;
  permissions: ReadonlyMap<PermissionKey, RoleScope>;
  assignedBranchIds: readonly string[];
  /** True when any role has ALL_BRANCHES scope: the user may pick "All branches". */
  canSeeAllBranches: boolean;
  /** Highest discount limits across roles. */
  discountLimitPercent: number;
  discountLimitAmount: number;
};

export type AccessInput = {
  userId: string;
  organizationId: string;
  assignedBranchIds: string[];
  roles: {
    scope: RoleScope;
    permissions: string[];
    discountLimitPercent?: number;
    discountLimitAmount?: number;
  }[];
};

export function buildAccess(input: AccessInput): Access {
  const permissions = new Map<PermissionKey, RoleScope>();
  let discountLimitPercent = 0;
  let discountLimitAmount = 0;
  for (const role of input.roles) {
    discountLimitPercent = Math.max(discountLimitPercent, role.discountLimitPercent ?? 0);
    discountLimitAmount = Math.max(discountLimitAmount, role.discountLimitAmount ?? 0);
    for (const key of role.permissions as PermissionKey[]) {
      const current = permissions.get(key);
      if (!current || SCOPE_RANK[role.scope] > SCOPE_RANK[current]) permissions.set(key, role.scope);
    }
  }
  return {
    userId: input.userId,
    organizationId: input.organizationId,
    permissions,
    assignedBranchIds: [...new Set(input.assignedBranchIds)],
    canSeeAllBranches: input.roles.some((r) => r.scope === "ALL_BRANCHES"),
    discountLimitPercent,
    discountLimitAmount,
  };
}

export function can(access: Access, permission: PermissionKey): boolean {
  return access.permissions.has(permission);
}

export function canAny(access: Access, permissions: readonly PermissionKey[]): boolean {
  return permissions.some((p) => access.permissions.has(p));
}

export function scopeOf(access: Access, permission: PermissionKey): RoleScope | null {
  return access.permissions.get(permission) ?? null;
}

export type BranchConstraint = {
  /** null = no branch restriction; [] = nothing visible */
  branchIds: string[] | null;
  /** true when the caller must also restrict to the user's own records */
  ownOnly: boolean;
};

/**
 * Which branches a query for `permission` may touch, given the branch picked in the switcher
 * (`activeBranchId` = null means "All branches" / "All my branches").
 */
export function branchConstraint(
  access: Access,
  permission: PermissionKey,
  activeBranchId: string | null,
): BranchConstraint {
  const scope = scopeOf(access, permission);
  if (!scope) return { branchIds: [], ownOnly: false };
  if (scope === "ALL_BRANCHES") {
    return { branchIds: activeBranchId ? [activeBranchId] : null, ownOnly: false };
  }
  const allowed = access.assignedBranchIds;
  const branchIds = activeBranchId ? (allowed.includes(activeBranchId) ? [activeBranchId] : []) : [...allowed];
  return { branchIds, ownOnly: scope === "OWN" };
}

/** Prisma `where` fragment for a branch-owned model. */
export function branchWhere(constraint: BranchConstraint, field = "branchId"): Record<string, unknown> {
  if (constraint.branchIds === null) return {};
  return { [field]: { in: constraint.branchIds } };
}

/** May the user act on a record that belongs to `branchId` with `permission`? */
export function canAccessBranch(access: Access, permission: PermissionKey, branchId: string): boolean {
  const scope = scopeOf(access, permission);
  if (!scope) return false;
  if (scope === "ALL_BRANCHES") return true;
  return access.assignedBranchIds.includes(branchId);
}

/** Branches the user may pick in the branch switcher. */
export function selectableBranchIds(access: Access, allActiveBranchIds: readonly string[]): string[] {
  if (access.canSeeAllBranches) return [...allActiveBranchIds];
  return allActiveBranchIds.filter((id) => access.assignedBranchIds.includes(id));
}
