"use client";

import { PlusIcon } from "lucide-react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveDriveAction } from "@/modules/placements/placements.actions";
import {
  DRIVE_STATUSES,
  DRIVE_STATUS_LABELS,
  driveSchema,
  type DriveInput,
} from "@/modules/placements/placements.schemas";

type Opt = { value: string; label: string };
export type DriveFormOptions = { companies: Opt[]; courses: Opt[]; branches: Opt[]; allBranches: boolean };

const ALL = "__all";

export function DriveDialog({
  options,
  initial,
  trigger,
}: {
  options: DriveFormOptions;
  initial?: DriveInput;
  trigger?: React.ReactNode;
}) {
  const defaults: DriveInput = initial ?? {
    companyId: options.companies[0]?.value ?? "",
    branchId: options.allBranches ? ALL : (options.branches[0]?.value ?? ""),
    title: "",
    jobRole: "",
    description: "",
    location: "",
    salaryMin: "",
    salaryMax: "",
    driveDate: "",
    lastDateToApply: "",
    courseIds: [],
    status: "OPEN",
  };
  const branchOpts = [...(options.allBranches ? [{ value: ALL, label: "All branches" }] : []), ...options.branches];
  return (
    <FormDialog
      trigger={
        trigger ?? (
          <Button>
            <PlusIcon /> New drive
          </Button>
        )
      }
      title={initial ? "Edit drive" : "New placement drive"}
      description="A job opening or hiring drive. Students of the chosen courses (and branch) can be put forward."
      schema={driveSchema}
      defaultValues={defaults}
      action={(v) => saveDriveAction({ ...v, branchId: v.branchId === ALL ? null : v.branchId })}
      successMessage="Drive saved"
      wide
    >
      {(form) => <DriveFields form={form} options={options} branchOpts={branchOpts} />}
    </FormDialog>
  );
}

function DriveFields({
  form,
  options,
  branchOpts,
}: {
  form: UseFormReturn<DriveInput, unknown, unknown>;
  options: DriveFormOptions;
  branchOpts: Opt[];
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField control={form.control} name="companyId" label="Company" options={options.companies} />
        <SelectField control={form.control} name="branchId" label="Students of" options={branchOpts} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField control={form.control} name="title" label="Title" placeholder="Campus drive – December" />
        <TextField control={form.control} name="jobRole" label="Job role" placeholder="Mobile service technician" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField control={form.control} name="location" label="Job location" />
        <TextField control={form.control} name="salaryMin" label="Salary from (₹/month)" type="number" min={0} />
        <TextField control={form.control} name="salaryMax" label="Salary up to (₹/month)" type="number" min={0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField control={form.control} name="driveDate" label="Drive / interview date" type="date" />
        <TextField control={form.control} name="lastDateToApply" label="Last date to apply" type="date" />
        <SelectField
          control={form.control}
          name="status"
          label="Status"
          options={DRIVE_STATUSES.map((s) => ({ value: s, label: DRIVE_STATUS_LABELS[s] }))}
        />
      </div>
      <Controller
        control={form.control}
        name="courseIds"
        render={({ field }) => (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Eligible courses (none ticked = any course)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.courses.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value.includes(c.value)}
                    onCheckedChange={(v) =>
                      field.onChange(
                        v === true ? [...field.value, c.value] : field.value.filter((x: string) => x !== c.value),
                      )
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      />
      <TextareaField
        control={form.control}
        name="description"
        label="Details"
        rows={3}
        placeholder="Requirements, shift, benefits…"
      />
    </>
  );
}
