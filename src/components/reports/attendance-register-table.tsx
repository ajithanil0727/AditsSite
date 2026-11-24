import { cn } from "@/lib/utils";
import { MARK_CODE, type AttendanceRegister } from "@/modules/courses/attendance-register";

const TONE: Record<string, string> = {
  P: "",
  L: "text-sky-foreground",
  "½": "text-peach-foreground",
  A: "font-semibold text-destructive",
  Lv: "text-lavender-foreground",
  H: "text-muted-foreground",
};

const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return { day: d.getUTCDate(), weekday: d.toLocaleString("en-IN", { weekday: "short", timeZone: "UTC" }).slice(0, 2) };
};

/** Plain table (no client JS) so it prints well. One row per student, one column per class day. */
export function AttendanceRegisterTable({ r, compact }: { r: AttendanceRegister; compact?: boolean }) {
  if (r.days.length === 0)
    return <p className="p-8 text-center text-sm text-muted-foreground">No classes marked in {r.period.label}.</p>;
  if (r.rows.length === 0)
    return <p className="p-8 text-center text-sm text-muted-foreground">No students in this batch.</p>;
  const cell = compact ? "px-1 py-0.5" : "px-1.5 py-1";
  return (
    <table className={cn("w-full border-collapse tabular-nums", compact ? "text-[10px]" : "text-xs")}>
      <thead>
        <tr className="border-b">
          <th className={cn(cell, "sticky left-0 bg-card text-left font-medium")}>Student</th>
          {r.days.map((d) => {
            const { day, weekday } = dayLabel(d.date);
            return (
              <th key={d.date} className={cn(cell, "text-center font-medium")} title={d.topic ?? undefined}>
                <div>{day}</div>
                <div className="font-normal text-muted-foreground">{weekday}</div>
              </th>
            );
          })}
          <th className={cn(cell, "border-l text-center font-medium")}>Present</th>
          <th className={cn(cell, "text-center font-medium")}>½</th>
          <th className={cn(cell, "text-center font-medium")}>Absent</th>
          <th className={cn(cell, "text-center font-medium")}>Leave</th>
          <th className={cn(cell, "text-center font-medium")}>%</th>
        </tr>
      </thead>
      <tbody>
        {r.rows.map((s) => (
          <tr key={s.enrollmentId} className="border-b last:border-0">
            <td className={cn(cell, "sticky left-0 bg-card whitespace-nowrap")}>
              <span className="font-medium">{s.name}</span>
              <span className="ml-1 text-muted-foreground">{s.code}</span>
              {s.status !== "ACTIVE" && (
                <span className="ml-1 text-muted-foreground">({s.status.toLowerCase().replace("_", " ")})</span>
              )}
            </td>
            {s.marks.map((m, i) => {
              const code = m ? MARK_CODE[m] : "";
              return (
                <td key={i} className={cn(cell, "text-center", TONE[code])}>
                  {code}
                </td>
              );
            })}
            <td className={cn(cell, "border-l text-center")}>{s.present}</td>
            <td className={cn(cell, "text-center")}>{s.half || ""}</td>
            <td className={cn(cell, "text-center")}>{s.absent || ""}</td>
            <td className={cn(cell, "text-center")}>{s.leave || ""}</td>
            <td className={cn(cell, "text-center font-semibold")}>{s.percent === null ? "—" : `${s.percent}%`}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2">
          <td className={cn(cell, "sticky left-0 bg-card font-medium")}>Present</td>
          {r.presentPerDay.map((n, i) => (
            <td key={i} className={cn(cell, "text-center text-muted-foreground")}>
              {n}
            </td>
          ))}
          <td colSpan={5} className="border-l" />
        </tr>
      </tfoot>
    </table>
  );
}
