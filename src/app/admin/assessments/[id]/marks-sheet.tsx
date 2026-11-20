"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { saveMarksAction } from "@/modules/academics/academics.actions";

type Student = {
  enrollmentId: string;
  studentId: string;
  name: string;
  code: string;
  marks: number | null;
  isAbsent: boolean;
  remarks: string;
  locked: boolean;
};
type Row = { marks: string; isAbsent: boolean; remarks: string };

export function MarksSheet({
  assessmentId,
  maxMarks,
  passMarks,
  editable,
  students,
}: {
  assessmentId: string;
  maxMarks: number;
  passMarks: number;
  editable: boolean;
  students: Student[];
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      students.map((s) => [
        s.enrollmentId,
        { marks: s.marks === null ? "" : String(s.marks), isAbsent: s.isAbsent, remarks: s.remarks },
      ]),
    ),
  );
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const problems = students.filter((s) => {
    const r = rows[s.enrollmentId];
    if (r.isAbsent || r.marks === "") return false;
    const n = Number(r.marks);
    return Number.isNaN(n) || n < 0 || n > maxMarks;
  });

  const save = () =>
    start(async () => {
      const res = await saveMarksAction({
        assessmentId,
        rows: students
          .filter((s) => !s.locked)
          .map((s) => ({
            enrollmentId: s.enrollmentId,
            marks: rows[s.enrollmentId].marks,
            isAbsent: rows[s.enrollmentId].isAbsent,
            remarks: rows[s.enrollmentId].remarks,
          })),
      });
      if (res.ok) toast.success("Marks saved");
      else toast.error(res.error);
    });

  if (students.length === 0)
    return (
      <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">No students in this batch.</p>
    );

  return (
    <div className="space-y-4">
      <div className="divide-y rounded-xl border">
        {students.map((s) => {
          const r = rows[s.enrollmentId];
          const n = r.marks === "" ? null : Number(r.marks);
          const result = r.isAbsent
            ? "absent"
            : n === null || Number.isNaN(n)
              ? null
              : n >= passMarks
                ? "pass"
                : "fail";
          const disabled = !editable || s.locked;
          return (
            <div key={s.enrollmentId} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-48 flex-1">
                <Link href={`/admin/students/${s.studentId}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {s.code}
                  {s.locked && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <LockIcon className="size-3" /> certificate issued
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Marks for ${s.name}`}
                  inputMode="decimal"
                  className="w-24 text-right tabular-nums"
                  value={r.isAbsent ? "" : r.marks}
                  placeholder={r.isAbsent ? "—" : `/ ${maxMarks}`}
                  disabled={disabled || r.isAbsent}
                  onChange={(e) => set(s.enrollmentId, { marks: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={r.isAbsent}
                    disabled={disabled}
                    onCheckedChange={(v) =>
                      set(s.enrollmentId, { isAbsent: v === true, marks: v === true ? "" : r.marks })
                    }
                    aria-label={`${s.name} was absent`}
                  />
                  Absent
                </label>
                <Input
                  aria-label={`Remarks for ${s.name}`}
                  className="w-48"
                  placeholder="Remarks"
                  value={r.remarks}
                  disabled={disabled}
                  onChange={(e) => set(s.enrollmentId, { remarks: e.target.value })}
                />
                <span className="w-16 text-right">
                  {result === "pass" && <StatusBadge tone="mint">pass</StatusBadge>}
                  {result === "fail" && <StatusBadge tone="danger">fail</StatusBadge>}
                  {result === "absent" && <StatusBadge tone="neutral">absent</StatusBadge>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="flex items-center justify-end gap-3">
          {problems.length > 0 && (
            <span className="text-sm text-destructive">Marks must be between 0 and {maxMarks}.</span>
          )}
          <Button onClick={save} disabled={pending || problems.length > 0}>
            {pending ? "Saving…" : "Save marks"}
          </Button>
        </div>
      )}
    </div>
  );
}
