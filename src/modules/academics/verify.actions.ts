"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { verifyCertificate } from "./academics.queries";

/** Public certificate check by number + issue date (both printed on it). Rate-limited per IP to stop guessing. */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>(); // in-memory; fine for one server

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const schema = z.object({
  number: z.string().trim().min(4).max(40),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type VerifyResult =
  { ok: false; error: string } | { ok: true; certificate: NonNullable<Awaited<ReturnType<typeof verifyCertificate>>> };

export async function verifyByNumber(input: { number: string; issuedOn: string }): Promise<VerifyResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (limited(ip)) return { ok: false, error: "Too many checks. Please wait a minute and try again." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the certificate number and the issue date printed on it." };
  const certificate = await verifyCertificate(parsed.data);
  if (!certificate)
    return { ok: false, error: "No certificate matches this number and date. Check both and try again." };
  return { ok: true, certificate };
}
