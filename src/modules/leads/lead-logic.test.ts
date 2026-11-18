import { describe, expect, it } from "vitest";
import { conversionReport, looksLikeBot, pickRoundRobin, RateLimiter, whatsappLink } from "./lead-logic";

describe("pickRoundRobin", () => {
  it("returns null with nobody in the rotation", () => {
    expect(pickRoundRobin([])).toBeNull();
  });
  it("prefers someone who never got a lead, then the longest wait", () => {
    const d = (s: string) => new Date(s);
    expect(
      pickRoundRobin([
        { id: "a", name: "Anu", lastAssignedAt: d("2026-11-18T10:00:00Z") },
        { id: "b", name: "Binu", lastAssignedAt: null },
      ]),
    ).toBe("b");
    expect(
      pickRoundRobin([
        { id: "a", name: "Anu", lastAssignedAt: d("2026-11-18T10:00:00Z") },
        { id: "b", name: "Binu", lastAssignedAt: d("2026-11-18T09:00:00Z") },
      ]),
    ).toBe("b");
  });
  it("breaks ties by name so the order is stable", () => {
    expect(
      pickRoundRobin([
        { id: "z", name: "Zara", lastAssignedAt: null },
        { id: "m", name: "Manu", lastAssignedAt: null },
      ]),
    ).toBe("m");
  });
  it("rotates through everyone", () => {
    const people = [
      { id: "a", name: "A", lastAssignedAt: null as Date | null },
      { id: "b", name: "B", lastAssignedAt: null as Date | null },
      { id: "c", name: "C", lastAssignedAt: null as Date | null },
    ];
    const got: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = pickRoundRobin(people)!;
      got.push(id);
      people.find((p) => p.id === id)!.lastAssignedAt = new Date(1_000 + i);
    }
    expect(got).toEqual(["a", "b", "c", "a", "b", "c"]);
  });
});

describe("looksLikeBot", () => {
  const now = 1_000_000;
  it("flags a filled honeypot", () => {
    expect(looksLikeBot({ honeypot: "http://spam", startedAt: now - 60_000, now })).toBe(true);
  });
  it("flags instant submissions and bad timestamps", () => {
    expect(looksLikeBot({ honeypot: "", startedAt: now - 500, now })).toBe(true);
    expect(looksLikeBot({ honeypot: "", startedAt: Number.NaN, now })).toBe(true);
  });
  it("accepts a normal submission, even from a form left open", () => {
    expect(looksLikeBot({ honeypot: "", startedAt: now - 20_000, now })).toBe(false);
    expect(looksLikeBot({ honeypot: null, startedAt: now - 3 * 86_400_000, now })).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("allows up to max hits per window", () => {
    const rl = new RateLimiter(2, 1_000);
    expect(rl.hit("ip", 0)).toBe(false);
    expect(rl.hit("ip", 10)).toBe(false);
    expect(rl.hit("ip", 20)).toBe(true);
    expect(rl.hit("other", 20)).toBe(false);
    expect(rl.hit("ip", 2_000)).toBe(false); // window passed
  });
});

describe("conversionReport", () => {
  const lead = (sourceId: string, assigneeId: string | null, state: "open" | "won" | "lost") => ({
    sourceId,
    sourceName: sourceId === "w" ? "Website" : "Walk-in",
    assigneeId,
    assigneeName: assigneeId ? `User ${assigneeId}` : null,
    isWon: state === "won",
    isLost: state === "lost",
  });
  const leads = [
    lead("w", "1", "won"),
    lead("w", "1", "lost"),
    lead("w", null, "open"),
    lead("w", "2", "won"),
    lead("k", "2", "won"),
  ];
  it("groups by source with conversion %", () => {
    expect(conversionReport(leads, "source")).toEqual([
      { key: "w", label: "Website", total: 4, open: 1, won: 2, lost: 1, rate: 50 },
      { key: "k", label: "Walk-in", total: 1, open: 0, won: 1, lost: 0, rate: 100 },
    ]);
  });
  it("groups by counsellor, with unassigned leads together", () => {
    const rows = conversionReport(leads, "assignee");
    expect(rows.map((r) => [r.label, r.total, r.won])).toEqual([
      ["User 1", 2, 1],
      ["User 2", 2, 2],
      ["Unassigned", 1, 0],
    ]);
  });
});

it("builds an Indian WhatsApp link", () => {
  expect(whatsappLink("98470 12345", "Hi there")).toBe("https://wa.me/919847012345?text=Hi%20there");
});
