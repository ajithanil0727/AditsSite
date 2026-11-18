"use client";

import { Controller, useWatch } from "react-hook-form";
import { ImagePicker } from "@/components/cms/media-library";
import { MarkdownEditor } from "@/components/cms/markdown-editor";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SelectField, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { saveCourseAction } from "@/modules/courses/courses.actions";
import {
  DURATION_LABELS,
  DURATION_UNITS,
  GST_MODES,
  GST_MODE_LABELS,
  courseSchema,
  type CourseInput,
} from "@/modules/courses/courses.schemas";

type Opt = { value: string; label: string };

export const EMPTY_COURSE: CourseInput = {
  code: "",
  name: "",
  slug: "",
  durationValue: "3",
  durationUnit: "MONTHS",
  fee: "",
  gstMode: "EXEMPT",
  taxRateId: null,
  hsnSacId: null,
  shortDescription: "",
  eligibility: "",
  showOnWebsite: true,
  showFeeOnWebsite: true,
  isFeatured: false,
  description: "",
  imageId: null,
  seoTitle: "",
  seoDescription: "",
  isActive: true,
  sortOrder: "0",
};

export function CourseFormDialog({
  trigger,
  initial,
  options,
}: {
  trigger: React.ReactNode;
  initial?: CourseInput;
  options: { rates: Opt[]; sac: Opt[] };
}) {
  return (
    <FormDialog
      wide
      trigger={trigger}
      title={initial ? "Edit course" : "New course"}
      description="One fixed fee per course. Instalment plans are set on the course page."
      schema={courseSchema}
      defaultValues={initial ?? EMPTY_COURSE}
      action={saveCourseAction}
      successMessage="Course saved"
    >
      {(form) => <CourseFields form={form} options={options} />}
    </FormDialog>
  );
}

function CourseFields({
  form,
  options,
}: {
  form: Parameters<Parameters<typeof FormDialog<typeof courseSchema>>[0]["children"]>[0];
  options: { rates: Opt[]; sac: Opt[] };
}) {
  const gstMode = useWatch({ control: form.control, name: "gstMode" });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField control={form.control} name="code" label="Code" placeholder="ACLR-ADV" />
      <TextField control={form.control} name="name" label="Name" placeholder="Advanced chip-level mobile repair" />
      <div className="grid grid-cols-2 gap-2">
        <TextField control={form.control} name="durationValue" label="Duration" type="number" min={1} />
        <SelectField
          control={form.control}
          name="durationUnit"
          label="Unit"
          options={DURATION_UNITS.map((u) => ({ value: u, label: DURATION_LABELS[u] }))}
        />
      </div>
      <TextField control={form.control} name="fee" label="Course fee (₹)" type="number" step="1" min={0} />
      <SelectField
        control={form.control}
        name="gstMode"
        label="GST"
        options={GST_MODES.map((m) => ({ value: m, label: GST_MODE_LABELS[m] }))}
        description="Stored now; fee tax invoices come later (receipts only for now)."
      />
      {gstMode !== "EXEMPT" ? (
        <SelectField control={form.control} name="taxRateId" label="GST rate" options={options.rates} />
      ) : (
        <span />
      )}
      <SelectField control={form.control} name="hsnSacId" label="SAC code" options={options.sac} allowNone="—" />
      <TextField
        control={form.control}
        name="slug"
        label="Web address (slug)"
        description="Leave blank to make one from the name."
      />
      <TextareaField
        control={form.control}
        name="shortDescription"
        label="Short description"
        rows={2}
        className="sm:col-span-2"
      />
      <TextField control={form.control} name="eligibility" label="Eligibility" className="sm:col-span-2" />
      <TextField control={form.control} name="sortOrder" label="Sort order" type="number" min={0} />
      <div className="flex flex-col gap-3 sm:col-span-2">
        <SwitchField control={form.control} name="isActive" label="Active (open for admissions)" />
        <SwitchField control={form.control} name="showOnWebsite" label="Show on website" />
        <SwitchField
          control={form.control}
          name="showFeeOnWebsite"
          label="Show the fee on the website"
          description="When off, the website says “Contact us for fees”."
        />
        <SwitchField control={form.control} name="isFeatured" label="Featured on the home page" />
      </div>
      <p className="pt-2 text-sm font-medium sm:col-span-2">Website page</p>
      <Controller
        control={form.control}
        name="imageId"
        render={({ field }) => (
          <Field className="sm:col-span-2">
            <FieldLabel>Image</FieldLabel>
            <ImagePicker value={field.value} onChange={field.onChange} aspect={16 / 9} />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="description"
        render={({ field }) => (
          <Field className="sm:col-span-2">
            <FieldLabel>Full description</FieldLabel>
            <MarkdownEditor value={field.value ?? ""} onChange={field.onChange} rows={8} />
            <FieldDescription>
              Shown on the course page. The syllabus (modules) is listed beside it automatically.
            </FieldDescription>
          </Field>
        )}
      />
      <TextField control={form.control} name="seoTitle" label="SEO title" maxLength={70} />
      <TextField control={form.control} name="seoDescription" label="SEO description" maxLength={160} />
    </div>
  );
}
