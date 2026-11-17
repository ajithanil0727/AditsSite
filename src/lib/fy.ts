/** Indian financial year helpers (FY runs 1 April to 31 March, IST). */

const IST_OFFSET_MINUTES = 330;

/** Calendar parts of a date in IST. */
export function istParts(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

/** Starting calendar year of the FY containing `date`. 17 Nov 2026 -> 2026, 10 Feb 2027 -> 2026. */
export function fyStartYear(date: Date): number {
  const { year, month } = istParts(date);
  return month >= 4 ? year : year - 1;
}

/** "26-27" */
export function financialYear(date: Date): string {
  const start = fyStartYear(date);
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "2627" (compact form for GST invoice numbers, which are limited to 16 characters) */
export function financialYearCompact(date: Date): string {
  return financialYear(date).replace("-", "");
}
