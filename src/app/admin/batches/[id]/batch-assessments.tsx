"use client";

import Link from "next/link";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { deleteAssessmentAction, saveAssessmentAction } from "@/modules/academics/academics.actions";
import type { BatchAssessmentRow } from "@/modules/academics/academics.queries";
import { assessmentSchema, type AssessmentInput } from "@/modules/academics/academics.schemas";

type Opt = { value: string; label: string };

export function AssessmentDialog({
  batchId,
  types,
  today,
  initial,
  trigger,
}: {
  batchId: string;
  types: Opt[];
  today: string;
  initial?: AssessmentInput;
  trigger?: React.ReactNode;
}) {
  const defaults: AssessmentInput = initial ?? {
    batchId,
    typeId: types[0]?.value ?? "",
    title: "",
    date: today,
    maxMarks: 100,
    passMarks: 40,
  };
  return (
    <FormDialog
      trigger={
        trigger ?? (
          <Button size="sm" variant="outline">
            <PlusIcon /> New assessment
          </Button>
        )
      }
      title={initial ? "Edit assessment" : "New assessment"}
      description="Theory or practical test for this batch. Marks are entered after it's held."
      schema={assessmentSchema}
      defaultValues={defaults}
      action={saveAssessmentAction}
      successMessage="Assessment saved"
    >
      {(form) => (
        <>
          <SelectField control={form.control} name="typeId" label="Type" options={types} />
          <TextField control={form.control} name="title" label="Title" placeholder="Module 3: power section" />
          <TextField control={form.control} name="date" label="Date" type="date" />
          <div className="grid grid-cols-2 gap-3">
            <TextField control={form.control} name="maxMarks" label="Maximum marks" type="number" min={1} step="0.5" />
            <TextField control={form.control} name="passMarks" label="Pass marks" type="number" min={0} step="0.5" />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function BatchAssessments({ rows, students }: { rows: BatchAssessmentRow[]; students: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No assessments yet.</p>;
  return (
    <ul className="divide-y text-sm">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 py-2">
          <span>
            <Link href={`/admin/assessments/${a.id}`} className="font-medium hover:underline">
              {a.title}
            </Link>
            <span className="block text-xs text-muted-foreground">
              {a.type} · {formatDate(a.date)} · out of {a.maxMarks}
            </span>
          </span>
          <span className="text-right text-xs text-muted-foreground tabular-nums">
            {a.marked}/{students} marked
            {a.average !== null && <span className="block">avg {a.average}%</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeleteAssessmentButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" className="text-destructive">
          <Trash2Icon /> Delete
        </Button>
      }
      title="Delete this assessment?"
      description="Its marks no longer count towards anyone's result."
      confirmLabel="Delete"
      destructive
      successMessage="Assessment deleted"
      action={() => deleteAssessmentAction({ id })}
    />
  );
}
