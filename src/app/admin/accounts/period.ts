import { fyStartYear, istDateOnly } from "@/lib/fy";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Period presets in IST. FY starts 1 April. */
export function periodPresets(now = new Date()) {
  const today = istDateOnly(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const fy = fyStartYear(now);
  return {
    today: iso(today),
    thisMonth: { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) },
    lastMonth: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    thisFy: { from: `${fy}-04-01`, to: iso(today) },
    lastFy: { from: `${fy - 1}-04-01`, to: `${fy}-03-31` },
  };
}

/** `from` / `to` from the URL, defaulting to this month. */
export function parsePeriod(
  sp: Record<string, string | string[] | undefined>,
  fallback?: { from: string; to: string },
) {
  const p = periodPresets();
  const def = fallback ?? p.thisMonth;
  const from = typeof sp.from === "string" && YMD.test(sp.from) ? sp.from : def.from;
  const toRaw = typeof sp.to === "string" && YMD.test(sp.to) ? sp.to : def.to;
  return { from, to: toRaw < from ? from : toRaw, presets: p };
}
