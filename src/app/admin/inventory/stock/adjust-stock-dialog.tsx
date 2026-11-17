"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SlidersHorizontalIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
import { PartPicker, type PickerPart } from "@/components/forms/part-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { adjustStockAction } from "@/modules/inventory/inventory.actions";
import { adjustSchema, type AdjustInput } from "@/modules/inventory/inventory.schemas";

export function AdjustStockDialog({
  branches,
  defaultBranchId,
  parts,
}: {
  branches: { id: string; name: string }[];
  defaultBranchId: string;
  parts: PickerPart[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const empty: AdjustInput = {
    branchId: defaultBranchId,
    partId: "",
    type: "ADJUSTMENT_IN",
    qty: "",
    unitCost: "",
    note: "",
  };
  const form = useForm<AdjustInput, unknown, z.output<typeof adjustSchema>>({
    resolver: zodResolver(adjustSchema),
    defaultValues: empty,
  });
  const type = useWatch({ control: form.control, name: "type" });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await adjustStockAction(form.getValues());
      if (handleActionResult(form, res, "Stock updated")) setOpen(false);
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(empty);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontalIcon /> Adjust stock
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            For stock-count corrections, damage, or parts used in the lab. Every adjustment is logged.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <SelectField
              control={form.control}
              name="branchId"
              label="Branch"
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
            <Controller
              control={form.control}
              name="partId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Part</FieldLabel>
                  <PartPicker
                    parts={parts}
                    value={field.value || null}
                    onChange={(p) => field.onChange(p.id)}
                    invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <SelectField
              control={form.control}
              name="type"
              label="Type"
              options={[
                { value: "ADJUSTMENT_IN", label: "Add stock (found / correction +)" },
                { value: "ADJUSTMENT_OUT", label: "Remove stock (damaged / lost / correction −)" },
                { value: "INTERNAL_USE", label: "Internal use (lab, training)" },
              ]}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="qty" label="Quantity" type="number" step="0.001" min={0} />
              {type === "ADJUSTMENT_IN" && (
                <TextField
                  control={form.control}
                  name="unitCost"
                  label="Unit cost (₹)"
                  type="number"
                  step="0.01"
                  min={0}
                  description="Blank = current average"
                />
              )}
            </div>
            <TextField control={form.control} name="note" label="Reason" />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
