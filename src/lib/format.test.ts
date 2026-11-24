import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatINR, indianPhone, normalizeIndianPhone } from "./format";
import { expandPermissions, ALL_PERMISSION_KEYS } from "./permissions";
import { DEFAULT_ROLES } from "@/modules/rbac/default-roles";

describe("formatDate / formatDateTime", () => {
  it("shows DD/MM/YYYY in IST", () => {
    // 20:00 UTC on 17 Nov = 01:30 IST on 18 Nov
    expect(formatDate(new Date("2026-11-17T20:00:00Z"))).toBe("18/11/2026");
    expect(formatDate(null)).toBe("");
  });
  it("shows 12-hour time", () => {
    expect(formatDateTime("2026-11-17T10:15:00Z")).toBe("17/11/2026, 03:45 PM");
    expect(formatDateTime("2026-11-16T18:30:00Z")).toBe("17/11/2026, 12:00 AM");
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(123456.5)).toBe("₹1,23,456.50");
    expect(formatINR("1000")).toBe("₹1,000.00");
  });
});

describe("Indian phone numbers", () => {
  it.each([
    ["9847012345", "9847012345"],
    ["+91 98470 12345", "9847012345"],
    ["091-9847012345".replace("091-", "0"), "9847012345"],
    ["919847012345", "9847012345"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });
  it.each(["12345", "5847012345", "98470123456"])("rejects %s", (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
    expect(indianPhone.safeParse(input).success).toBe(false);
  });
});

describe("permissions catalogue", () => {
  it("keys are unique and use module.action", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    for (const k of ALL_PERMISSION_KEYS) expect(k).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
  it("expands wildcards and rejects unknown keys", () => {
    expect(expandPermissions(["roles.*"]).sort()).toEqual(["roles.manage", "roles.view"]);
    expect(() => expandPermissions(["nope.view"])).toThrow();
  });
  it("default roles only use real permissions; super admin has all; owner all but managing owners and the audit log", () => {
    for (const role of DEFAULT_ROLES) for (const p of role.permissions) expect(ALL_PERMISSION_KEYS).toContain(p);
    expect(DEFAULT_ROLES.find((r) => r.name === "Super Admin")!.permissions.length).toBe(ALL_PERMISSION_KEYS.length);
    const owner = DEFAULT_ROLES.find((r) => r.name === "Owner / Partner")!.permissions;
    expect(owner.length).toBe(ALL_PERMISSION_KEYS.length - 2);
    expect(owner).not.toContain("users.manage_protected");
    expect(owner).not.toContain("audit.view");
    // The audit log is for the super admin only.
    for (const r of DEFAULT_ROLES.filter((x) => x.name !== "Super Admin"))
      expect(r.permissions, r.name).not.toContain("audit.view");
    expect(DEFAULT_ROLES.find((r) => r.name === "Admin")!.permissions).not.toContain("profit.lock");
  });
});

import { amountInWords } from "./format";

describe("amountInWords (Indian system)", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [5, "Rupees Five Only"],
    [4500, "Rupees Four Thousand Five Hundred Only"],
    [123456.5, "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only"],
    [10_00_00_000, "Rupees Ten Crore Only"],
    [0.75, "Rupees Zero and Seventy Five Paise Only"],
  ])("%s", (n, words) => {
    expect(amountInWords(n)).toBe(words);
  });
});
