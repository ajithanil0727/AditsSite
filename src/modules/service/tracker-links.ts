import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Signed, unguessable link to an invoice for the repair tracker (no customer login). */
const sign = (invoiceId: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`invoice:${invoiceId}`).digest("base64url").slice(0, 32);

export function invoiceLink(invoiceId: string) {
  return `/track/invoice/${invoiceId}?t=${sign(invoiceId)}`;
}

export function validInvoiceToken(invoiceId: string, token: string | undefined | null) {
  if (!token) return false;
  const a = Buffer.from(sign(invoiceId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
