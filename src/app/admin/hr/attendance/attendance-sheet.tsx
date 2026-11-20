"use client";

import { CheckCheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useUrlState } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "@/modules/hr/hr.actions";
import { STAFF_MARK_LABELS, STAFF_MARKS } from "@/modules/hr/hr.schemas";

type Mark = (typeof STAFF_MARKS)[number];
type Sheet = {
  date: string;
  sunday: boolean;
  holiday: string | null;
  locked: boolean;
  staff: {
    id: string;
    name: string;
    code: string;
    designation: string | null;
    status: string | null;
    note: string;
    markedBy: string | null;
  }[];
};

const TONE: Record<Mark, string> = {
  PRESENT: "bg-mint text-mint-foreground border-transparent",
  LATE: "bg-sky text-sky-foreground border-transparent",
  HALF_DAY: "bg-peach text-peach-foreground border-transparent",
  ABSENT: "bg-destructive/15 text-destructive border-transparent",
  LEAVE: "bg-lavender text-lavender-foreground border-transparent",
};

export function StaffAttendanceSheet({
  branches,
  branchId,
  today,
  sheet,
  canMark,
}: {
  branches: { value: string; label: string }[];
  branchId: string;
  today: string;
  sheet: Sheet;
  canMark: boolean;
}) {
  const { set } = useUrlState();
  const [marks, setMarks] = useState<Record<string, Mark | null>>(() =>
    Object.fromEntries(sheet.staff.map((s) => [s.id, (s.status as Mark | null) ?? null])),
  );
  const [pending, start] = useTransition();
  const editable = canMark && !sheet.locked;
  const marked = Object.values(marks).filter(Boolean).length;

  const save = () =>
    start(async () => {
      const records = sheet.staff
        .filter((s) => marks[s.id])
        .map((s) => ({ employeeId: s.id, status: marks[s.id]!, note: null }));
      if (records.length === 0) return void toast.error("Mark at least one person.");
      const res = await saveAttendanceAction({ branchId, date: sheet.date, records });
      if (res.ok) toast.success("Attendance saved");
      else toast.error(res.error);
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {branches.length > 1 && (
          <div className="grid gap-1.5">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={(v) => set({ branch: v })}>
              <SelectTrigger className="w-48" aria-label="Branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="att-date">Date</Label>
          <Input
            id="att-date"
            type="date"
            value={sheet.date}
            max={today}
            onChange={(e) => e.target.value && set({ date: e.target.value })}
            className="w-44"
          />
        </div>
        {editable && (
          <Button
            variant="outline"
            onClick={() =>
              setMarks(
                Object.fromEntries(sheet.staff.map((s) => [s.id, marks[s.id] === "LEAVE" ? "LEAVE" : "PRESENT"])),
              )
            }
          >
            <CheckCheckIcon /> All present
          </Button>
        )}
      </div>

      {(sheet.sunday || sheet.holiday || sheet.locked) && (
        <p className="rounded-md bg-sky px-3 py-2 text-sm text-sky-foreground">
          {sheet.locked
            ? "Payroll for this month is finalised, so attendance is locked."
            : sheet.holiday
              ? `${formatDate(sheet.date)} is a holiday (${sheet.holiday}). It's paid whatever is marked.`
              : "Sunday is the weekly off. It's paid whatever is marked."}
        </p>
      )}

      <div className="divide-y rounded-xl border">
        {sheet.staff.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No staff at this branch on this date.</p>
        )}
        {sheet.staff.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.code}
                {s.designation ? ` · ${s.designation}` : ""}
                {s.markedBy ? ` · marked by ${s.markedBy}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
              {STAFF_MARKS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={marks[s.id] === m}
                  disabled={!editable}
                  onClick={() => setMarks((x) => ({ ...x, [s.id]: m }))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                    marks[s.id] === m ? TONE[m] : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {STAFF_MARK_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {editable && sheet.staff.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            {marked} of {sheet.staff.length} marked
          </span>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      )}
    </div>
  );
}
