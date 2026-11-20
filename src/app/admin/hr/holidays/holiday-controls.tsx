"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useUrlState } from "@/components/data-table/data-table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteHolidayAction, saveHolidayAction } from "@/modules/hr/hr.actions";
import { holidaySchema, type HolidayInput } from "@/modules/hr/hr.schemas";

export function YearPicker({ year, current }: { year: number; current: number }) {
  const { set } = useUrlState();
  const years = [current - 1, current, current + 1];
  return (
    <Select value={String(year)} onValueChange={(v) => set({ year: v })}>
      <SelectTrigger className="w-40" aria-label="Year">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            FY {String(y % 100).padStart(2, "0")}-{String((y + 1) % 100).padStart(2, "0")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function HolidayDialog({
  branches,
  initial,
}: {
  branches: { value: string; label: string }[];
  initial?: HolidayInput;
}) {
  return (
    <FormDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${initial.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon /> Add holiday
          </Button>
        )
      }
      title={initial ? "Edit holiday" : "Add holiday"}
      schema={holidaySchema}
      defaultValues={initial ?? { date: "", name: "", branchId: null }}
      action={saveHolidayAction}
      successMessage="Holiday saved"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="date" label="Date" type="date" />
          <TextField control={form.control} name="name" label="Name" placeholder="Onam, Vishu, Christmas…" />
          <SelectField
            control={form.control}
            name="branchId"
            label="Applies to"
            options={branches}
            allowNone="All branches"
          />
        </>
      )}
    </FormDialog>
  );
}

export function DeleteHoliday({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`}>
          <Trash2Icon />
        </Button>
      }
      title={`Delete ${name}?`}
      description="The day becomes a normal working day."
      confirmLabel="Delete"
      destructive
      successMessage="Holiday deleted"
      action={() => deleteHolidayAction({ id })}
    />
  );
}
