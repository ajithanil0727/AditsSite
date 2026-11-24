/**
 * Privilege-escalation guards (pure, unit tested).
 * A user may only hand out what they have themselves.
 */
import type { RoleScope } from "@/generated/prisma/enums";
import type { PermissionKey } from "@/lib/permissions";
import { SCOPE_RANK, type Access } from "./access";

/** Permissions in `keys` the actor does not have. */
export function permissionsBeyond(actor: Access, keys: readonly string[]): string[] {
  return keys.filter((k) => !actor.permissions.has(k as PermissionKey));
}

/** Can the actor assign a role (with these permissions) at this scope? */
export function canGrantRole(actor: Access, rolePermissionKeys: readonly string[], scope: RoleScope): string | null {
  const missing = permissionsBeyond(actor, rolePermissionKeys);
  if (missing.length)
    return `You can't assign a role with permissions you don't have (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}).`;
  const widest = Math.max(-1, ...[...actor.permissions.values()].map((s) => SCOPE_RANK[s]));
  if (SCOPE_RANK[scope] > widest) return "You can't assign a wider scope than your own.";
  return null;
}

/**
 * Protected roles (Super Admin, Owner) and the accounts that hold them can only be managed by someone with
 * `users.manage_protected` (the Super Admin). Owners run the business but can't add owners or touch the
 * super admin's account.
 */
export function canManageProtected(actor: Access): boolean {
  return actor.permissions.has("users.manage_protected");
}

/**
 * Super Admin accounts and roles (anything granting users.manage_protected) are invisible to everyone else
 * (owners decided 2026-11-24: the super admin handles the system and isn't part of the business's staff list).
 * Prisma `where` fragments; pure objects so this module stays importable anywhere.
 */
export const SUPER_ADMIN_ROLE_WHERE = {
  permissions: { some: { permission: { key: "users.manage_protected" } } },
} as const;
export const NOT_SUPER_ADMIN_USER_WHERE = { NOT: { roles: { some: { role: SUPER_ADMIN_ROLE_WHERE } } } } as const;
export const NOT_SUPER_ADMIN_ROLE_WHERE = { NOT: SUPER_ADMIN_ROLE_WHERE } as const;

/** Error message if the actor would add or remove a protected role, else null. */
export function protectedRoleChangeProblem(
  actor: Access,
  change: { before: { roleId: string; isProtected: boolean }[]; after: { roleId: string; isProtected: boolean }[] },
): string | null {
  if (canManageProtected(actor)) return null;
  const key = (r: { roleId: string }) => r.roleId;
  const beforeIds = new Set(change.before.filter((r) => r.isProtected).map(key));
  const afterIds = new Set(change.after.filter((r) => r.isProtected).map(key));
  const changed = [...beforeIds].some((id) => !afterIds.has(id)) || [...afterIds].some((id) => !beforeIds.has(id));
  return changed ? "Only a super admin can add or remove owners and super admins." : null;
}

/** Branches in `branchIds` the actor can't hand out. */
export function branchesBeyond(actor: Access, branchIds: readonly string[]): string[] {
  if (actor.canSeeAllBranches) return [];
  return branchIds.filter((id) => !actor.assignedBranchIds.includes(id));
}
