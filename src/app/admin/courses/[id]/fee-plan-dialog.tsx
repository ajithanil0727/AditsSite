"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useFieldArray } from "react-hook-form";
import { SwitchField, TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveFeePlanAction } from "@/modules/courses/courses.actions";
import { feePlanSchema, type FeePlanInput } from "@/modules/courses/courses.schemas";

export function FeePlanDialog({
  courseId,
  initial,
  trigger,
}: {
  courseId: string;
  initial?: FeePlanInput;
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title={initial ? "Edit fee plan" : "New fee plan"}
      description="Percentages of the course fee; days counted from the admission date. They must add up to 100%."
      schema={feePlanSchema}
      defaultValues={
        initial ?? {
          courseId,
          name: "",
          isActive: true,
          items: [
            { label: "At admission", percentOfFee: "50", dueAfterDays: "0" },
            { label: "Second instalment", percentOfFee: "50", dueAfterDays: "30" },
          ],
        }
      }
      action={saveFeePlanAction}
      successMessage="Fee plan saved"
    >
      {(form) => <PlanFields form={form} />}
    </FormDialog>
  );
}

function PlanFields({
  form,
}: {
  form: Parameters<Parameters<typeof FormDialog<typeof feePlanSchema>>[0]["children"]>[0];
}) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const err = form.formState.errors.items;
  return (
    <>
      <TextField control={form.control} name="name" label="Plan name" placeholder="3 instalments" />
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_5rem_5rem_2.25rem] gap-2 text-xs text-muted-foreground">
          <span>Label</span>
          <span>%</span>
          <span>Day</span>
          <span />
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_5rem_5rem_2.25rem] gap-2">
            <Controller
              control={form.control}
              name={`items.${i}.label`}
              render={({ field }) => <Input {...field} aria-label="Label" />}
            />
            <Controller
              control={form.control}
              name={`items.${i}.percentOfFee`}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  type="number"
                  step="0.01"
                  aria-label="Percent"
                />
              )}
            />
            <Controller
              control={form.control}
              name={`items.${i}.dueAfterDays`}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  type="number"
                  min={0}
                  aria-label="Days after admission"
                />
              )}
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(i)}>
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => append({ label: `Instalment ${fields.length + 1}`, percentOfFee: "", dueAfterDays: "30" })}
        >
          <PlusIcon /> Add instalment
        </Button>
        <FieldError>{err?.root?.message ?? err?.message}</FieldError>
      </div>
      <SwitchField control={form.control} name="isActive" label="Active" />
    </>
  );
}
