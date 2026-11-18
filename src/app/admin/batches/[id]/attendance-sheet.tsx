"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "@/modules/students/students.actions";
import { ATTENDANCE_LABELS } from "@/modules/students/students.schemas";

type Status = keyof typeof ATTENDANCE_LABELS;
const QUICK: Status[] = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE"];
const TONE: Record<Status, string> = {
  PRESENT: "bg-mint text-mint-foreground border-transparent",
  ABSENT: "bg-destructive/15 text-destructive border-transparent",
  LATE: "bg-peach text-peach-foreground border-transparent",
  HALF_DAY: "bg-sky text-sky-foreground border-transparent",
  LEAVE: "bg-lavender text-lavender-foreground border-transparent",
  HOLIDAY: "bg-secondary text-secondary-foreground border-transparent",
};

export function AttendanceSheet({
  batchId,
  date,
  today,
  canMark,
  topic: initialTopic,
  students,
  markedBy,
}: {
  batchId: string;
  date: string;
  today: string;
  canMark: boolean;
  topic: string;
  students: { enrollmentId: string; name: string; code: string; status: Status | null }[];
  markedBy: string | null;
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Status>>(() =>
    Object.fromEntries(students.map((s) => [s.enrollmentId, s.status ?? "PRESENT"])),
  );
  const [topic, setTopic] = useState(initialTopic);
  const [pending, startTransition] = useTransition();
  const saved = students.some((s) => s.status);

  const setAll = (status: Status) => setMarks(Object.fromEntries(students.map((s) => [s.enrollmentId, status])));
  const save = () =>
    startTransition(async () => {
      const res = await saveAttendanceAction({
        batchId,
        date,
        topic,
        records: students.map((s) => ({ enrollmentId: s.enrollmentId, status: marks[s.enrollmentId] })),
      });
      if (res.ok) toast.success("Attendance saved");
      else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="att-date">Date</Label>
          <Input
            id="att-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && router.replace(`?date=${e.target.value}`)}
            className="w-44"
          />
        </div>
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor="att-topic">Topic covered</Label>
          <Input
            id="att-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={!canMark}
            placeholder="e.g. PMIC basics, charging section"
          />
        </div>
        {canMark && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setAll("PRESENT")}>
              All present
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAll("HOLIDAY")}>
              Holiday
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {saved ? `Saved${markedBy ? ` by ${markedBy}` : ""}. Changes overwrite it.` : "Not marked yet for this date."}
      </p>
      <ul className="divide-y">
        {students.map((s) => (
          <li key={s.enrollmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm">
              <span className="font-medium">{s.name}</span>{" "}
              <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
            </span>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
              {QUICK.map((st) => {
                const on = marks[s.enrollmentId] === st;
                return (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canMark}
                    onClick={() => setMarks((m) => ({ ...m, [s.enrollmentId]: st }))}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-60",
                      on ? TONE[st] : "hover:bg-accent",
                    )}
                  >
                    {ATTENDANCE_LABELS[st]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {canMark && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      )}
    </div>
  );
}
