"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { formatINR } from "@/lib/format";
import { payVendorAction } from "@/modules/inventory/inventory.actions";
import { vendorPaymentSchema, type VendorPaymentInput } from "@/modules/inventory/inventory.schemas";

type Opt = { value: string; label: string };

export function VendorPaymentDialog({
  purchaseId,
  due,
  options,
  today,
}: {
  purchaseId: string;
  due: number;
  options: { modes: Opt[]; accounts: Opt[] };
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const empty: VendorPaymentInput = {
    purchaseId,
    amount: String(due),
    paymentModeId: options.modes[0]?.value ?? "",
    moneyAccountId: options.accounts[0]?.value ?? "",
    reference: "",
    paidAt: today,
  };
  const form = useForm<VendorPaymentInput, unknown, z.output<typeof vendorPaymentSchema>>({
    resolver: zodResolver(vendorPaymentSchema),
    defaultValues: empty,
  });
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await payVendorAction(form.getValues());
      if (handleActionResult(form, res, "Payment recorded")) setOpen(false);
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
        <Button>Record payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay vendor · {formatINR(due)} due</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="amount" label="Amount (₹)" type="number" step="0.01" min={0} />
              <TextField control={form.control} name="paidAt" label="Date" type="date" />
            </div>
            <SelectField control={form.control} name="paymentModeId" label="Mode" options={options.modes} />
            <SelectField control={form.control} name="moneyAccountId" label="Paid from" options={options.accounts} />
            <TextField control={form.control} name="reference" label="Reference (UTR / cheque no.)" />
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
