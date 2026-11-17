/** Pure helpers for audit snapshots (unit tested). */

const REDACTED_KEYS = new Set(["password", "token", "accessToken", "refreshToken", "idToken", "secret"]);
const IGNORED_KEYS = new Set(["updatedAt", "createdAt"]);

type Plain = Record<string, unknown>;

/** Turn a Prisma record into plain JSON (Decimal/Date -> string) and redact secrets. */
export function toAuditJson(value: unknown): Plain | null {
  if (value == null) return null;
  const plain = JSON.parse(JSON.stringify(value)) as Plain;
  return redact(plain);
}

function redact(obj: Plain): Plain {
  const out: Plain = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(k)) out[k] = "[redacted]";
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = redact(v as Plain);
    else out[k] = v;
  }
  return out;
}

/**
 * Keep only the fields that changed. Returns null/null when nothing changed.
 * `before` and `after` must already be plain JSON (see toAuditJson).
 */
export function diffForAudit(before: Plain | null, after: Plain | null): { before: Plain | null; after: Plain | null } {
  if (!before || !after) return { before, after };
  const b: Plain = {};
  const a: Plain = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (IGNORED_KEYS.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  if (Object.keys(a).length === 0 && Object.keys(b).length === 0) return { before: null, after: null };
  return { before: b, after: a };
}
