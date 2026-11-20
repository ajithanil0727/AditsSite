import { describe, expect, it } from "vitest";
import {
  certificateEligibility,
  DEFAULT_CERTIFICATE_RULES as RULES,
  gradeFor,
  makeVerifyCode,
  overallPercent,
  placementStat,
  validateRules,
} from "./academic-logic";

describe("overallPercent", () => {
  it("averages each assessment's % with equal weight; absent = 0; unmarked left out", () => {
    expect(
      overallPercent([
        { marks: 40, maxMarks: 50, isAbsent: false }, // 80
        { marks: 60, maxMarks: 100, isAbsent: false }, // 60
        { marks: null, maxMarks: 100, isAbsent: false }, // not marked
      ]),
    ).toBe(70);
    expect(
      overallPercent([
        { marks: null, maxMarks: 100, isAbsent: true },
        { marks: 90, maxMarks: 100, isAbsent: false },
      ]),
    ).toBe(45);
    expect(overallPercent([])).toBeNull();
  });
});

describe("gradeFor", () => {
  it("picks the highest band reached", () => {
    expect(gradeFor(95, RULES.grades)).toBe("A+");
    expect(gradeFor(90, RULES.grades)).toBe("A+");
    expect(gradeFor(74.99, RULES.grades)).toBe("B");
    expect(gradeFor(40, RULES.grades)).toBe("C");
    expect(gradeFor(39.9, RULES.grades)).toBeNull();
  });
});

describe("certificateEligibility", () => {
  const ok = {
    status: "COMPLETED" as const,
    duePaise: 0,
    attendancePct: 80,
    results: [{ marks: 80, maxMarks: 100, isAbsent: false }],
    hasCertificate: false,
  };
  it("is eligible when completed, paid, passed and attended enough", () => {
    expect(certificateEligibility(ok, RULES)).toEqual({ eligible: true, problems: [], overall: 80, grade: "A" });
  });
  it("lists every problem", () => {
    const r = certificateEligibility(
      {
        status: "ACTIVE",
        duePaise: 500000,
        attendancePct: 60,
        results: [{ marks: 30, maxMarks: 100, isAbsent: false }],
        hasCertificate: false,
      },
      RULES,
    );
    expect(r.eligible).toBe(false);
    expect(r.problems).toHaveLength(4);
    expect(r.problems[1]).toContain("5,000");
    expect(r.grade).toBeNull();
  });
  it("needs marks and attendance", () => {
    const r = certificateEligibility({ ...ok, results: [], attendancePct: null }, RULES);
    expect(r.problems).toEqual(["No assessment marks yet.", "No attendance recorded."]);
  });
  it("attendance exactly at the minimum is enough", () => {
    expect(certificateEligibility({ ...ok, attendancePct: 75 }, RULES).eligible).toBe(true);
  });
});

describe("validateRules", () => {
  it("accepts the defaults and rejects gaps or duplicates", () => {
    expect(validateRules(RULES)).toBeNull();
    expect(validateRules({ ...RULES, passPercent: 35 })).toMatch(/no grade/);
    expect(
      validateRules({
        ...RULES,
        grades: [
          { grade: "A", min: 40 },
          { grade: "a", min: 60 },
        ],
      }),
    ).toMatch(/different name/);
  });
});

describe("placementStat", () => {
  it("is placed ÷ completed students who didn't opt out", () => {
    const s = placementStat([
      { status: "COMPLETED", placementOptOut: false, placed: true },
      { status: "COMPLETED", placementOptOut: false, placed: false },
      { status: "COMPLETED", placementOptOut: true, placed: false },
      { status: "ACTIVE", placementOptOut: false, placed: true }, // not completed yet: outside the %
      { status: "DROPPED", placementOptOut: false, placed: false },
    ]);
    expect(s).toEqual({ completed: 3, optedIn: 2, placed: 1, percent: 50 });
    expect(placementStat([]).percent).toBeNull();
  });
});

describe("makeVerifyCode", () => {
  it("uses only unambiguous characters", () => {
    const code = makeVerifyCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });
});
