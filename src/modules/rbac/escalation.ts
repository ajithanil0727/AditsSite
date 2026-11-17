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

/** Branches in `branchIds` the actor can't hand out. */
export function branchesBeyond(actor: Access, branchIds: readonly string[]): string[] {
  if (actor.canSeeAllBranches) return [];
  return branchIds.filter((id) => !actor.assignedBranchIds.includes(id));
}
