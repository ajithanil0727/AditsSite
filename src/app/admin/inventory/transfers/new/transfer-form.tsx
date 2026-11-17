"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
import { LineItems } from "@/components/forms/line-items";
import type { PickerPart } from "@/components/forms/part-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { createTransferAction } from "@/modules/inventory/inventory.actions";
import { transferSchema, type TransferInput } from "@/modules/inventory/inventory.schemas";

export function TransferForm({
  fromBranches,
  allBranches,
  fromId,
  parts,
}: {
  fromBranches: { id: string; name: string }[];
  allBranches: { id: string; name: string }[];
  fromId: string;
  parts: PickerPart[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<TransferInput, unknown, z.output<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: { fromBranchId: fromId, toBranchId: "", note: "", items: [{ partId: "", qty: "1" }] },
  });
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await createTransferAction(form.getValues());
      handleActionResult(form, res);
    }),
  );
  const itemsError = form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-4xl space-y-6">
      <Card>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="fromBranchId"
              label="From"
              options={fromBranches.map((b) => ({ value: b.id, label: b.name }))}
              description="Stock shown in the part list is for this branch."
            />
            <SelectField
              control={form.control}
              name="toBranchId"
              label="To"
              options={allBranches.map((b) => ({ value: b.id, label: b.name }))}
            />
            <TextField control={form.control} name="note" label="Note" className="sm:col-span-2" />
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <LineItems
            control={form.control}
            name="items"
            parts={parts}
            defaults={{ partId: "", qty: "1" }}
            error={itemsError}
          />
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create transfer"}
        </Button>
      </div>
    </form>
  );
}
