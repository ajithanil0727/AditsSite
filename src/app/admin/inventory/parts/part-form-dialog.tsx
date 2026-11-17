"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { savePartAction } from "@/modules/inventory/inventory.actions";
import { PART_KINDS, PART_KIND_LABELS, partSchema, type PartInput } from "@/modules/inventory/inventory.schemas";

type Opt = { value: string; label: string };
export type PartFormOptions = { categories: Opt[]; units: Opt[]; hsn: Opt[]; rates: Opt[] };

export function PartFormDialog({
  trigger,
  initial,
  options,
}: {
  trigger: React.ReactNode;
  initial?: PartInput;
  options: PartFormOptions;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const empty: PartInput = {
    sku: "",
    name: "",
    kind: "SPARE_PART",
    categoryId: null,
    unitId: options.units[0]?.value ?? "",
    hsnSacId: null,
    taxRateId: options.rates.find((r) => r.label.includes("18"))?.value ?? null,
    defaultSalePrice: "",
    reorderLevel: "0",
    brandText: "",
    compatibleModels: "",
    isActive: true,
  };
  const form = useForm<PartInput, unknown, z.output<typeof partSchema>>({
    resolver: zodResolver(partSchema),
    defaultValues: initial ?? empty,
  });
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await savePartAction(form.getValues());
      if (handleActionResult(form, res, initial ? "Part updated" : "Part created")) setOpen(false);
    }),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(initial ?? empty);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit part" : "New part"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="sku" label="SKU / code" />
            <SelectField
              control={form.control}
              name="kind"
              label="Kind"
              options={PART_KINDS.map((k) => ({ value: k, label: PART_KIND_LABELS[k] }))}
            />
            <TextField control={form.control} name="name" label="Name" className="sm:col-span-2" />
            <SelectField
              control={form.control}
              name="categoryId"
              label="Category"
              options={options.categories}
              allowNone="—"
            />
            <SelectField control={form.control} name="unitId" label="Unit" options={options.units} />
            <SelectField control={form.control} name="hsnSacId" label="HSN code" options={options.hsn} allowNone="—" />
            <SelectField
              control={form.control}
              name="taxRateId"
              label="GST rate"
              options={options.rates}
              allowNone="—"
            />
            <TextField
              control={form.control}
              name="defaultSalePrice"
              label="Sale price (₹, incl. GST)"
              type="number"
              step="0.01"
              min={0}
            />
            <TextField
              control={form.control}
              name="reorderLevel"
              label="Reorder level"
              type="number"
              step="0.001"
              min={0}
              description="Low-stock alert at or below this"
            />
            <TextField control={form.control} name="brandText" label="Brand" />
            <TextField control={form.control} name="compatibleModels" label="Compatible models" />
            <SwitchField control={form.control} name="isActive" label="Active" className="sm:col-span-2" />
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
