/**
 * Enquiry / CRM rules (pure, unit tested).
 *
 * Phase 4 decisions:
 * - Website enquiries: the visitor picks the branch (required).
 * - New leads are shared round-robin among users assigned to that branch whose role gives
 *   "Receive new leads" at branch level (own / assigned branches). All-branch roles (owners, admins)
 *   hold the permission so they can grant it, but are not in the rotation.
 * - A repeat enquiry from a phone that already has an OPEN lead of the same type is added to that lead
 *   (no new lead). Closed (won/lost) leads or a different type start a new lead.
 * - Admitting a student / opening a job card for a phone with an open lead of that type marks it won.
 * - Spam: hidden honeypot, minimum fill time, per-IP and per-phone rate limits. No third-party service.
 */

export type RotationCandidate = { id: string; name: string; lastAssignedAt: Date | null };

/** Next counsellor in the rotation: whoever got a lead longest ago (never = first), ties by name. */
export function pickRoundRobin(candidates: RotationCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const ta = a.lastAssignedAt?.getTime() ?? -1;
    const tb = b.lastAssignedAt?.getTime() ?? -1;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return sorted[0].id;
}

export type StatusFlags = { isWon: boolean; isLost: boolean };
export const isOpenStatus = (s: StatusFlags) => !s.isWon && !s.isLost;

/** Minimum time a human needs to fill the form. Faster submissions are treated as bots. */
export const MIN_FILL_MS = 3_000;
/** Honeypot filled in, or the form was submitted faster than a person can type. */
export function looksLikeBot(opts: { honeypot: string | null | undefined; startedAt: number; now: number }): boolean {
  if (opts.honeypot && opts.honeypot.trim() !== "") return true;
  const age = opts.now - opts.startedAt;
  return !Number.isFinite(age) || age < MIN_FILL_MS;
}

/** Sliding-window limiter (in memory; one app server). Returns true when the key is over the limit. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.clear();
    return recent.length > this.max;
  }
}

export type ReportLead = {
  sourceId: string;
  sourceName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  isWon: boolean;
  isLost: boolean;
};

export type ReportRow = {
  key: string;
  label: string;
  total: number;
  open: number;
  won: number;
  lost: number;
  rate: number | null;
};

/** Conversion rate = won / (won + lost + open). Rows sorted by total, biggest first. */
export function conversionReport(leads: ReportLead[], by: "source" | "assignee"): ReportRow[] {
  const map = new Map<string, ReportRow>();
  for (const l of leads) {
    const key = by === "source" ? l.sourceId : (l.assigneeId ?? "none");
    const label = by === "source" ? l.sourceName : (l.assigneeName ?? "Unassigned");
    const row = map.get(key) ?? { key, label, total: 0, open: 0, won: 0, lost: 0, rate: null };
    row.total++;
    if (l.isWon) row.won++;
    else if (l.isLost) row.lost++;
    else row.open++;
    map.set(key, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, rate: r.total ? Math.round((r.won / r.total) * 1000) / 10 : null }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** WhatsApp click-to-chat link for an Indian mobile number (10 digits). */
export function whatsappLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/91${digits}${q}`;
}
