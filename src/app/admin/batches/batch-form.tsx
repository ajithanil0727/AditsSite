"use client";

import { useWatch } from "react-hook-form";
import { SelectField, TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { saveBatchAction } from "@/modules/courses/courses.actions";
import { BATCH_STATUSES, BATCH_STATUS_LABELS, batchSchema, type BatchInput } from "@/modules/courses/courses.schemas";

type Opt = { value: string; label: string };

export function BatchFormDialog({
  trigger,
  initial,
  branches,
  courses,
  trainers,
  today,
}: {
  trigger: React.ReactNode;
  initial?: BatchInput;
  branches: Opt[];
  courses: Opt[];
  trainers: (Opt & { branchIds: string[] })[];
  today: string;
}) {
  return (
    <FormDialog
      wide
      trigger={trigger}
      title={initial ? "Edit batch" : "New batch"}
      schema={batchSchema}
      defaultValues={
        initial ?? {
          branchId: branches[0]?.value ?? "",
          courseId: "",
          code: "",
          name: "",
          trainerId: null,
          startDate: today,
          endDate: "",
          timing: "10:00–13:00",
          days: "Mon–Sat",
          capacity: "20",
          status: "PLANNED",
        }
      }
      action={saveBatchAction}
      successMessage="Batch saved"
    >
      {(form) => <Fields form={form} branches={branches} courses={courses} trainers={trainers} />}
    </FormDialog>
  );
}

function Fields({
  form,
  branches,
  courses,
  trainers,
}: {
  form: Parameters<Parameters<typeof FormDialog<typeof batchSchema>>[0]["children"]>[0];
  branches: Opt[];
  courses: Opt[];
  trainers: (Opt & { branchIds: string[] })[];
}) {
  const branchId = useWatch({ control: form.control, name: "branchId" });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField control={form.control} name="branchId" label="Branch" options={branches} />
      <SelectField control={form.control} name="courseId" label="Course" options={courses} />
      <TextField control={form.control} name="code" label="Batch code" placeholder="KOC-ADV-2611" />
      <TextField control={form.control} name="name" label="Name" placeholder="Advanced · Nov 2026 · Morning" />
      <SelectField
        control={form.control}
        name="trainerId"
        label="Trainer"
        allowNone="Not assigned"
        options={trainers.filter((t) => t.branchIds.includes(branchId))}
      />
      <TextField control={form.control} name="capacity" label="Capacity" type="number" min={1} />
      <TextField control={form.control} name="startDate" label="Starts" type="date" />
      <TextField control={form.control} name="endDate" label="Ends" type="date" />
      <TextField control={form.control} name="timing" label="Timing" />
      <TextField control={form.control} name="days" label="Days" />
      <SelectField
        control={form.control}
        name="status"
        label="Status"
        options={BATCH_STATUSES.map((s) => ({ value: s, label: BATCH_STATUS_LABELS[s] }))}
      />
    </div>
  );
}
