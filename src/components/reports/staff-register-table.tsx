import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StaffRegister } from "@/modules/hr/staff-register";

const TONE: Record<string, string> = {
  A: "font-semibold text-destructive",
  LOP: "font-semibold text-destructive",
  "½": "text-peach-foreground",
  L: "text-sky-foreground",
  Lv: "text-lavender-foreground",
  S: "text-muted-foreground",
  H: "text-muted-foreground",
  "?": "text-peach-foreground",
  "–": "text-muted-foreground",
};
const num = (n: number) => (n ? String(n) : "");

/** Plain table (no client JS) so it prints well. One row per employee, one column per day of the month. */
export function StaffRegisterTable({ r, compact }: { r: StaffRegister; compact?: boolean }) {
  if (r.rows.length === 0)
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">No staff at this branch in {r.period.label}.</p>
    );
  const cell = compact ? "px-0.5 py-0.5" : "px-1 py-1";
  return (
    <table className={cn("w-full border-collapse tabular-nums", compact ? "text-[9px]" : "text-xs")}>
      <thead>
        <tr className="border-b">
          <th className={cn(cell, "sticky left-0 bg-card text-left font-medium")}>Employee</th>
          {r.days.map((d) => (
            <th
              key={d.date}
              className={cn(cell, "text-center font-medium", (d.sunday || d.holiday) && "text-muted-foreground")}
            >
              {Number(d.date.slice(8))}
            </th>
          ))}
          {["Present", "½", "Absent", "Leave", "LOP leave", "Not marked", "LOP days", "Paid days"].map((h) => (
            <th key={h} className={cn(cell, "text-center font-medium", h === "Present" && "border-l")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.rows.map((e) => (
          <tr key={e.id} className="border-b last:border-0">
            <td className={cn(cell, "sticky left-0 bg-card whitespace-nowrap")}>
              <Link href={`/admin/hr/employees/${e.id}`} className="font-medium hover:underline print:no-underline">
                {e.name}
              </Link>
              <span className="ml-1 text-muted-foreground">{e.code}</span>
            </td>
            {e.cells.map((c, i) => (
              <td
                key={i}
                className={cn(cell, "text-center", TONE[c], (r.days[i].sunday || r.days[i].holiday) && "bg-muted/40")}
              >
                {c}
              </td>
            ))}
            <td className={cn(cell, "border-l text-center")}>{e.summary.present}</td>
            <td className={cn(cell, "text-center")}>{num(e.summary.halfDays)}</td>
            <td className={cn(cell, "text-center")}>{num(e.summary.absent)}</td>
            <td className={cn(cell, "text-center")}>{num(e.summary.paidLeave)}</td>
            <td className={cn(cell, "text-center")}>{num(e.summary.unpaidLeave)}</td>
            <td className={cn(cell, "text-center", e.summary.unmarked > 0 && "text-peach-foreground")}>
              {num(e.summary.unmarked)}
            </td>
            <td className={cn(cell, "text-center")}>{num(e.summary.lopDays)}</td>
            <td className={cn(cell, "text-center font-semibold")}>{e.summary.paidDays}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
