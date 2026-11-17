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

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`);
  return parts.join(" ");
}

/** Indian-system amount in words: 123456.5 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only". */
export function amountInWords(value: number): string {
  const paiseTotal = Math.round(Math.abs(value) * 100);
  let rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";
  const units: [number, string][] = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
  ];
  const words: string[] = [];
  for (const [size, name] of units) {
    const q = Math.floor(rupees / size);
    if (q) {
      words.push(`${q >= 1000 ? amountInWords(q).replace(/^Rupees | Only$/g, "") : below1000(q)} ${name}`);
      rupees %= size;
    }
  }
  if (rupees) words.push(below1000(rupees));
  const r = words.join(" ");
  return `Rupees ${r || "Zero"}${paise ? ` and ${below1000(paise)} Paise` : ""} Only`;
}
