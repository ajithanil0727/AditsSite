"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { LEAD_TYPE_LABELS, LEAD_TYPES, leadSchema, type LeadInput } from "@/modules/leads/leads.schemas";
import { saveLeadAction } from "@/modules/leads/leads.actions";

type Option = { value: string; label: string };
export type LeadFormOptions = {
  branches: Option[];
  sources: Option[];
  courses: Option[];
  deviceTypes: Option[];
  assignees: (Option & { branchIds: string[] | null })[];
  canAssign: boolean;
};

function Fields({
  form,
  options,
  isNew,
}: {
  form: UseFormReturn<LeadInput, unknown, unknown>;
  options: LeadFormOptions;
  isNew: boolean;
}) {
  const [type, branchId] = useWatch({ control: form.control, name: ["type", "branchId"] });
  const assignees = options.assignees.filter((a) => !a.branchIds || !branchId || a.branchIds.includes(branchId));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        control={form.control}
        name="type"
        label="Enquiry for"
        options={LEAD_TYPES.map((t) => ({ value: t, label: LEAD_TYPE_LABELS[t] }))}
      />
      <SelectField control={form.control} name="branchId" label="Branch" options={options.branches} />
      <TextField control={form.control} name="name" label="Name" />
      <TextField control={form.control} name="phone" label="Mobile number" inputMode="tel" maxLength={14} />
      <TextField control={form.control} name="altPhone" label="Other number" inputMode="tel" maxLength={14} />
      <TextField control={form.control} name="email" label="Email" type="email" />
      <TextField control={form.control} name="city" label="City" />
      <SelectField control={form.control} name="sourceId" label="Source" options={options.sources} />
      {type === "COURSE" ? (
        <SelectField
          control={form.control}
          name="courseId"
          label="Course"
          options={options.courses}
          allowNone="Not decided"
          className="sm:col-span-2"
        />
      ) : (
        <>
          <SelectField
            control={form.control}
            name="deviceTypeId"
            label="Device type"
            options={options.deviceTypes}
            allowNone="—"
          />
          <TextField control={form.control} name="deviceText" label="Device" placeholder="Samsung A52" />
          <TextareaField control={form.control} name="problemText" label="Problem" rows={2} className="sm:col-span-2" />
        </>
      )}
      <TextareaField
        control={form.control}
        name="message"
        label="Notes from the enquiry"
        rows={2}
        className="sm:col-span-2"
      />
      <TextField control={form.control} name="nextFollowUpAt" label="Next follow-up" type="datetime-local" />
      {isNew && options.canAssign && (
        <SelectField
          control={form.control}
          name="assignedToId"
          label="Assign to"
          options={assignees}
          allowNone="Automatic (round-robin)"
        />
      )}
    </div>
  );
}

export function LeadFormDialog({
  trigger,
  options,
  initial,
}: {
  trigger: React.ReactNode;
  options: LeadFormOptions;
  initial?: LeadInput;
}) {
  const walkIn = options.sources.find((s) => /walk/i.test(s.label))?.value ?? options.sources[0]?.value ?? "";
  const defaults: LeadInput = initial ?? {
    type: "COURSE",
    branchId: options.branches.length === 1 ? options.branches[0].value : "",
    sourceId: walkIn,
    name: "",
    phone: "",
    altPhone: "",
    email: "",
    city: "",
    courseId: null,
    deviceTypeId: null,
    deviceText: "",
    problemText: "",
    message: "",
    assignedToId: null,
    nextFollowUpAt: "",
  };
  return (
    <FormDialog
      trigger={trigger}
      title={initial ? "Edit enquiry" : "New enquiry"}
      description={
        initial
          ? undefined
          : "A walk-in or phone enquiry. If this number already has an open enquiry, it's added to that one."
      }
      schema={leadSchema}
      defaultValues={defaults}
      action={saveLeadAction}
      successMessage={initial ? "Enquiry saved" : undefined}
      wide
    >
      {(form) => <Fields form={form} options={options} isNew={!initial} />}
    </FormDialog>
  );
}
