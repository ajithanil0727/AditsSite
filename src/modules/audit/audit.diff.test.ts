import { describe, expect, it } from "vitest";
import { diffForAudit, toAuditJson } from "./audit.diff";

describe("toAuditJson", () => {
  it("serialises dates and redacts secrets, including nested ones", () => {
    const json = toAuditJson({ at: new Date("2026-11-17T00:00:00Z"), password: "x", nested: { token: "t", ok: 1 } });
    expect(json).toEqual({
      at: "2026-11-17T00:00:00.000Z",
      password: "[redacted]",
      nested: { token: "[redacted]", ok: 1 },
    });
  });
});

describe("diffForAudit", () => {
  it("keeps only changed fields and ignores timestamps", () => {
    expect(diffForAudit({ a: 1, b: 2, updatedAt: "x" }, { a: 1, b: 3, updatedAt: "y" })).toEqual({
      before: { b: 2 },
      after: { b: 3 },
    });
  });
  it("returns nulls when nothing changed", () => {
    expect(diffForAudit({ a: [1, 2] }, { a: [1, 2] })).toEqual({ before: null, after: null });
  });
  it("passes through create/delete snapshots", () => {
    expect(diffForAudit(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
  });
});
