/** Display + validation helpers for India: DD/MM/YYYY, INR, Indian phone numbers. */
import { z } from "zod";
import { istParts } from "./fy";

const pad = (n: number) => String(n).padStart(2, "0");

/** 17/11/2026 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const { year, month, day } = istParts(new Date(value));
  return `${pad(day)}/${pad(month)}/${year}`;
}

/** 17/11/2026, 03:45 PM */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() + 330 * 60_000);
  const h = d.getUTCHours();
  const time = `${pad(h % 12 || 12)}:${pad(d.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
  return `${formatDate(value)}, ${time}`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** ₹1,23,456.00 */
export function formatINR(value: number | string | { toString(): string } | null | undefined): string {
  if (value == null) return "";
  return inr.format(Number(value.toString()));
}

/** Normalise to 10 digits; accepts +91 / 91 / 0 prefixes, spaces and dashes. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input
    .replace(/[\s\-()]/g, "")
    .replace(/^\+?91(?=\d{10}$)/, "")
    .replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const indianPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const phone = normalizeIndianPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return phone;
  });

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
