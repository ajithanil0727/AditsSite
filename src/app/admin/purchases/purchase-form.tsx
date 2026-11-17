"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
import { LineItems } from "@/components/forms/line-items";
import type { PickerPart } from "@/components/forms/part-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { formatINR } from "@/lib/format";
import { savePurchaseAction } from "@/modules/inventory/inventory.actions";
import { purchaseSchema, type PurchaseInput } from "@/modules/inventory/inventory.schemas";

type Opt = { value: string; label: string };

export function PurchaseForm({
  initial,
  branches,
  vendors,
  parts,
  unregisteredBranchIds,
}: {
  initial: PurchaseInput;
  branches: Opt[];
  vendors: Opt[];
  parts: (PickerPart & { taxRate: number })[];
  unregisteredBranchIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<PurchaseInput, unknown, z.output<typeof purchaseSchema>>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: initial,
  });
  const [items, branchId] = useWatch({ control: form.control, name: ["items", "branchId"] });
  const totals = (items ?? []).reduce(
    (a, i) => {
      const net = Number(i.qty || 0) * Number(i.unitCost || 0);
      const tax = (net * Number(i.taxRate || 0)) / 100;
      return { net: a.net + net, tax: a.tax + tax };
    },
    { net: 0, tax: 0 },
  );

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await savePurchaseAction(form.getValues());
      handleActionResult(form, res);
    }),
  );
  const itemsError = form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-5xl space-y-6">
      <Card>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <SelectField control={form.control} name="branchId" label="Branch" options={branches} />
            <SelectField control={form.control} name="vendorId" label="Vendor" options={vendors} />
            <TextField control={form.control} name="billNo" label="Vendor bill no." />
            <TextField control={form.control} name="billDate" label="Bill date" type="date" />
            <TextField control={form.control} name="notes" label="Notes" className="sm:col-span-2" />
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4">
          <LineItems
            control={form.control}
            name="items"
            parts={parts}
            extras={[
              { name: "unitCost", label: "Cost/unit (ex-GST)" },
              { name: "taxRate", label: "GST %", step: "0.01" },
            ]}
            defaults={{ partId: "", qty: "1", unitCost: "", taxRate: "18" }}
            onPartChosen={(i, p) => {
              const part = parts.find((x) => x.id === p.id);
              if (part) form.setValue(`items.${i}.taxRate`, String(part.taxRate));
            }}
            error={itemsError}
          />
          <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
            <dt className="text-muted-foreground">Before GST</dt>
            <dd className="text-right tabular-nums">{formatINR(totals.net)}</dd>
            <dt className="text-muted-foreground">GST</dt>
            <dd className="text-right tabular-nums">{formatINR(totals.tax)}</dd>
            <dt className="font-medium">Bill total</dt>
            <dd className="text-right font-medium tabular-nums">{formatINR(totals.net + totals.tax)}</dd>
          </dl>
          {unregisteredBranchIds.includes(branchId) && (
            <p className="rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
              This branch has no GSTIN, so the GST paid can&apos;t be claimed back. It&apos;s added to the part cost
              when you post.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
