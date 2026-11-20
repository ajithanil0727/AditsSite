/**
 * Pure rules for assessments, certificates and placement stats (no DB). Shared by services, pages and tests.
 */

export type GradeBand = { grade: string; min: number };

export type CertificateRules = {
  /** Minimum attendance % across the student's batch sessions. */
  minAttendance: number;
  /** Minimum overall % to pass the course. */
  passPercent: number;
  /** Highest first; the first band whose `min` the overall % reaches is the grade. */
  grades: GradeBand[];
};

export const DEFAULT_CERTIFICATE_RULES: CertificateRules = {
  minAttendance: 75,
  passPercent: 40,
  grades: [
    { grade: "A+", min: 90 },
    { grade: "A", min: 75 },
    { grade: "B", min: 60 },
    { grade: "C", min: 40 },
  ],
};

export type ResultLine = { marks: number | null; maxMarks: number; isAbsent: boolean };

/** One assessment's %: absent = 0. Null when marks aren't entered yet. */
export function resultPercent(r: ResultLine): number | null {
  if (r.isAbsent) return 0;
  if (r.marks === null || r.maxMarks <= 0) return null;
  return (r.marks / r.maxMarks) * 100;
}

/**
 * Overall % = the average of each assessment's % (every assessment weighs the same, whatever its max marks).
 * Assessments without marks yet are left out. Rounded to 2 decimals. Null when nothing is marked.
 */
export function overallPercent(results: ResultLine[]): number | null {
  const pcts = results.map(resultPercent).filter((p): p is number => p !== null);
  if (pcts.length === 0) return null;
  return Math.round((pcts.reduce((a, p) => a + p, 0) / pcts.length) * 100) / 100;
}

/** Grade for an overall %, or null when it's below every band (= failed). */
export function gradeFor(percent: number, bands: GradeBand[]): string | null {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => percent >= b.min)?.grade ?? null;
}

export type EligibilityInput = {
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "DROPPED";
  /** Fees still due, in paise (instalments not paid or waived). */
  duePaise: number;
  attendancePct: number | null;
  results: ResultLine[];
  hasCertificate: boolean;
};

export type Eligibility = {
  eligible: boolean;
  problems: string[];
  overall: number | null;
  grade: string | null;
};

/** Certificate rules (owners, 2026-11-20): completed + no dues + passed (overall %) + minimum attendance. */
export function certificateEligibility(input: EligibilityInput, rules: CertificateRules): Eligibility {
  const problems: string[] = [];
  const overall = overallPercent(input.results);
  if (input.hasCertificate) problems.push("A certificate was already issued.");
  if (input.status !== "COMPLETED") problems.push("The course isn't marked completed.");
  if (input.duePaise > 0) problems.push(`Fees of ₹${(input.duePaise / 100).toLocaleString("en-IN")} are still due.`);
  if (overall === null) problems.push("No assessment marks yet.");
  else if (overall < rules.passPercent)
    problems.push(`Overall ${overall}% is below the pass mark of ${rules.passPercent}%.`);
  if (input.attendancePct === null) problems.push("No attendance recorded.");
  else if (input.attendancePct < rules.minAttendance)
    problems.push(`Attendance ${input.attendancePct}% is below the minimum of ${rules.minAttendance}%.`);
  const grade = overall !== null && overall >= rules.passPercent ? gradeFor(overall, rules.grades) : null;
  return { eligible: problems.length === 0, problems, overall, grade };
}

/** Validates certificate rules typed in settings. Returns a problem or null. */
export function validateRules(r: CertificateRules): string | null {
  if (r.grades.length === 0) return "Add at least one grade.";
  const names = new Set(r.grades.map((g) => g.grade.trim().toUpperCase()));
  if (names.size !== r.grades.length) return "Each grade needs a different name.";
  const mins = new Set(r.grades.map((g) => g.min));
  if (mins.size !== r.grades.length) return "Each grade needs a different minimum %.";
  const lowest = Math.min(...r.grades.map((g) => g.min));
  if (lowest > r.passPercent)
    return `The lowest grade starts at ${lowest}%, above the pass mark: someone who passes would get no grade.`;
  return null;
}

// ------------------------------------------------------------------ placements

export type PlacementEnrollment = {
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "DROPPED";
  placementOptOut: boolean;
  /** Has an offer that wasn't declined (joined or joining). */
  placed: boolean;
};

export type PlacementStat = { completed: number; optedIn: number; placed: number; percent: number | null };

/**
 * Placement % (owners, 2026-11-20) = placed ÷ students who completed the course and didn't opt out of placement.
 * Placed = took an offer (joined, or joining pending); a declined offer doesn't count.
 * Students placed before completing still count as placed but only in the % once they complete.
 */
export function placementStat(list: PlacementEnrollment[]): PlacementStat {
  const completed = list.filter((e) => e.status === "COMPLETED");
  const optedIn = completed.filter((e) => !e.placementOptOut);
  const placed = optedIn.filter((e) => e.placed).length;
  return {
    completed: completed.length,
    optedIn: optedIn.length,
    placed,
    percent: optedIn.length ? Math.round((placed / optedIn.length) * 1000) / 10 : null,
  };
}

/** Random, unguessable code for the QR verification URL (no look-alike characters). */
export function makeVerifyCode(random: (n: number) => Uint8Array, length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(random(length), (b) => alphabet[b % alphabet.length]).join("");
}
