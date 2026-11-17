import { describe, expect, it } from "vitest";
import {
  branchConstraint,
  branchWhere,
  buildAccess,
  can,
  canAccessBranch,
  scopeOf,
  selectableBranchIds,
} from "./access";
import { branchesBeyond, canGrantRole } from "./escalation";

const base = { userId: "u1", organizationId: "o1" };

describe("buildAccess", () => {
  it("unions permissions across roles and keeps the widest scope", () => {
    const access = buildAccess({
      ...base,
      assignedBranchIds: ["b1"],
      roles: [
        { scope: "OWN", permissions: ["jobcards.view", "jobcards.update"] },
        { scope: "ASSIGNED_BRANCHES", permissions: ["jobcards.view"] },
      ],
    });
    expect(scopeOf(access, "jobcards.view")).toBe("ASSIGNED_BRANCHES");
    expect(scopeOf(access, "jobcards.update")).toBe("OWN");
    expect(can(access, "fees.collect")).toBe(false);
    expect(access.canSeeAllBranches).toBe(false);
  });

  it("takes the highest discount limits", () => {
    const access = buildAccess({
      ...base,
      assignedBranchIds: [],
      roles: [
        { scope: "OWN", permissions: [], discountLimitPercent: 5, discountLimitAmount: 1000 },
        { scope: "OWN", permissions: [], discountLimitPercent: 10, discountLimitAmount: 500 },
      ],
    });
    expect(access.discountLimitPercent).toBe(10);
    expect(access.discountLimitAmount).toBe(1000);
  });
});

describe("branchConstraint", () => {
  const all = buildAccess({
    ...base,
    assignedBranchIds: ["b1"],
    roles: [{ scope: "ALL_BRANCHES", permissions: ["students.view"] }],
  });
  const assigned = buildAccess({
    ...base,
    assignedBranchIds: ["b1", "b2"],
    roles: [{ scope: "ASSIGNED_BRANCHES", permissions: ["students.view"] }],
  });
  const own = buildAccess({
    ...base,
    assignedBranchIds: ["b1"],
    roles: [{ scope: "OWN", permissions: ["jobcards.view"] }],
  });

  it("ALL scope: no restriction for 'All branches', the picked branch otherwise", () => {
    expect(branchConstraint(all, "students.view", null)).toEqual({ branchIds: null, ownOnly: false });
    expect(branchConstraint(all, "students.view", "b9")).toEqual({ branchIds: ["b9"], ownOnly: false });
  });

  it("ASSIGNED scope: limited to assigned branches, and a foreign pick sees nothing", () => {
    expect(branchConstraint(assigned, "students.view", null)).toEqual({ branchIds: ["b1", "b2"], ownOnly: false });
    expect(branchConstraint(assigned, "students.view", "b2")).toEqual({ branchIds: ["b2"], ownOnly: false });
    expect(branchConstraint(assigned, "students.view", "b9")).toEqual({ branchIds: [], ownOnly: false });
  });

  it("OWN scope: assigned branches plus an own-records flag", () => {
    expect(branchConstraint(own, "jobcards.view", null)).toEqual({ branchIds: ["b1"], ownOnly: true });
  });

  it("missing permission: nothing visible", () => {
    expect(branchConstraint(own, "fees.view", null)).toEqual({ branchIds: [], ownOnly: false });
  });

  it("branchWhere builds a Prisma fragment", () => {
    expect(branchWhere({ branchIds: null, ownOnly: false })).toEqual({});
    expect(branchWhere({ branchIds: ["b1"], ownOnly: false }, "id")).toEqual({ id: { in: ["b1"] } });
  });

  it("canAccessBranch respects scope", () => {
    expect(canAccessBranch(all, "students.view", "b9")).toBe(true);
    expect(canAccessBranch(assigned, "students.view", "b2")).toBe(true);
    expect(canAccessBranch(assigned, "students.view", "b9")).toBe(false);
    expect(canAccessBranch(assigned, "fees.view", "b1")).toBe(false);
  });

  it("selectableBranchIds: all for ALL scope, assigned otherwise", () => {
    expect(selectableBranchIds(all, ["b1", "b2", "b3"])).toEqual(["b1", "b2", "b3"]);
    expect(selectableBranchIds(assigned, ["b1", "b3"])).toEqual(["b1"]);
  });
});

describe("escalation guards", () => {
  const manager = buildAccess({
    ...base,
    assignedBranchIds: ["b1"],
    roles: [{ scope: "ASSIGNED_BRANCHES", permissions: ["users.create", "students.view", "fees.collect"] }],
  });

  it("blocks granting permissions the actor lacks", () => {
    expect(canGrantRole(manager, ["students.view"], "ASSIGNED_BRANCHES")).toBeNull();
    expect(canGrantRole(manager, ["students.view", "roles.manage"], "ASSIGNED_BRANCHES")).toMatch(/roles\.manage/);
  });

  it("blocks granting a wider scope than the actor's own", () => {
    expect(canGrantRole(manager, ["students.view"], "ALL_BRANCHES")).toMatch(/wider scope/);
    expect(canGrantRole(manager, ["students.view"], "OWN")).toBeNull();
  });

  it("blocks assigning branches outside the actor's own", () => {
    expect(branchesBeyond(manager, ["b1"])).toEqual([]);
    expect(branchesBeyond(manager, ["b1", "b2"])).toEqual(["b2"]);
  });
});
