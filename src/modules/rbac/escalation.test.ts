import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { buildAccess } from "./access";
import { DEFAULT_ROLES } from "./default-roles";
import { canGrantRole, canManageProtected, protectedRoleChangeProblem } from "./escalation";

const role = (name: string) => DEFAULT_ROLES.find((r) => r.name === name)!;
const accessFor = (name: string) =>
  buildAccess({
    userId: "u1",
    organizationId: "o1",
    assignedBranchIds: [],
    roles: [{ scope: "ALL_BRANCHES", permissions: role(name).permissions }],
  });

describe("super admin and protected roles", () => {
  const superAdmin = accessFor("Super Admin");
  const owner = accessFor("Owner / Partner");
  const admin = accessFor("Admin");

  it("only the super admin holds every permission", () => {
    expect(role("Super Admin").permissions).toHaveLength(ALL_PERMISSION_KEYS.length);
    expect(canManageProtected(superAdmin)).toBe(true);
    expect(canManageProtected(owner)).toBe(false);
    expect(canManageProtected(admin)).toBe(false);
  });

  it("Super Admin and Owner are protected; Admin is staff-level", () => {
    expect(role("Super Admin").isProtected).toBe(true);
    expect(role("Owner / Partner").isProtected).toBe(true);
    expect(role("Admin").isProtected).toBeFalsy();
  });

  it("owners keep everything else, including the website", () => {
    const keys = role("Owner / Partner").permissions;
    for (const k of ["website.edit", "website.publish", "users.create", "partners.manage", "profit.lock"] as const)
      expect(keys).toContain(k);
    expect(keys).not.toContain("users.manage_protected");
  });

  const P = { roleId: "owner", isProtected: true };
  const S = { roleId: "staff", isProtected: false };

  it("an owner can't add or remove an owner", () => {
    expect(protectedRoleChangeProblem(owner, { before: [S], after: [S, P] })).toMatch(/super admin/);
    expect(protectedRoleChangeProblem(owner, { before: [P], after: [S] })).toMatch(/super admin/);
  });

  it("an owner can change staff roles, and keep their own owner role when editing themselves", () => {
    expect(protectedRoleChangeProblem(owner, { before: [S], after: [] })).toBeNull();
    expect(protectedRoleChangeProblem(owner, { before: [P], after: [P] })).toBeNull();
  });

  it("the super admin can add owners", () => {
    expect(protectedRoleChangeProblem(superAdmin, { before: [], after: [P] })).toBeNull();
    expect(canGrantRole(superAdmin, role("Owner / Partner").permissions, "ALL_BRANCHES")).toBeNull();
  });

  it("an admin can't grant the Owner role either", () => {
    expect(canGrantRole(admin, role("Owner / Partner").permissions, "ALL_BRANCHES")).not.toBeNull();
  });
});
