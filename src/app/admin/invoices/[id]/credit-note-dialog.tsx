"use client";

import { ReceiptTextIcon } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { issueCreditNoteAction } from "@/modules/invoices/invoices.actions";
import { creditNoteSchema, type CreditNoteInput } from "@/modules/invoices/credit-notes.schemas";

type Opt = { value: string; label: string };

function Fields({
  form,
  modes,
  accounts,
  max,
}: {
  form: UseFormReturn<CreditNoteInput, unknown, unknown>;
  modes: Opt[];
  accounts: Opt[];
  max: number;
}) {
  const refund = useWatch({ control: form.control, name: "refund" });
  return (
    <>
      <TextField
        control={form.control}
        name="amount"
        label="Amount including GST (₹)"
        type="number"
        step="0.01"
        min={0}
        max={max}
        description={`Up to ${formatINR(max)}.`}
      />
      <TextareaField
        control={form.control}
        name="reason"
        label="Reason"
        rows={2}
        placeholder="Part failed within warranty, overcharged…"
      />
      <SwitchField
        control={form.control}
        name="refund"
        label="Pay the money back now"
        description="Records the refund in the day book."
      />
      {refund && (
        <>
          <SelectField control={form.control} name="paymentModeId" label="Paid back by" options={modes} />
          <SelectField control={form.control} name="moneyAccountId" label="From account" options={accounts} />
          <TextField control={form.control} name="reference" label="Reference (UPI / cheque no.)" />
        </>
      )}
    </>
  );
}

export function CreditNoteDialog({
  invoiceId,
  max,
  modes,
  accounts,
}: {
  invoiceId: string;
  max: number;
  modes: Opt[];
  accounts: Opt[];
}) {
  const defaults: CreditNoteInput = {
    invoiceId,
    amount: max,
    reason: "",
    refund: false,
    paymentModeId: modes[0]?.value ?? null,
    moneyAccountId: null,
    reference: "",
  };
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <ReceiptTextIcon /> Credit note
        </Button>
      }
      title="Issue a credit note"
      description="For a delivered repair: reduces this invoice (and service income) by the amount, with GST reversed in proportion."
      schema={creditNoteSchema}
      defaultValues={defaults}
      action={issueCreditNoteAction}
      submitLabel="Issue credit note"
    >
      {(form) => <Fields form={form} modes={modes} accounts={accounts} max={max} />}
    </FormDialog>
  );
}
