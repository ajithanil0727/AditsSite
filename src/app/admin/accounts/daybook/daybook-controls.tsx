"use client";

import { ArrowLeftRightIcon } from "lucide-react";
import { useUrlState } from "@/components/data-table/data-table";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { contraAction } from "@/modules/accounts/accounts.actions";
import { contraSchema, type ContraInput } from "@/modules/accounts/accounts.schemas";

type Opt = { value: string; label: string };

export function AccountFilter({ accounts, value }: { accounts: Opt[]; value: string | null }) {
  const { set } = useUrlState();
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => set({ account: v === "__all" ? null : v })}>
      <SelectTrigger className="w-56" aria-label="Account">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">All accounts</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.value} value={a.value}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ContraDialog({ accounts, today }: { accounts: (Opt & { branchId: string })[]; today: string }) {
  const defaults: ContraInput = {
    fromAccountId: "",
    toAccountId: "",
    date: today,
    amount: "" as unknown as number,
    note: "",
  };
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <ArrowLeftRightIcon /> Move money
        </Button>
      }
      title="Move money between accounts"
      description="For example, cash deposited into the branch's bank account. Both accounts must be of the same branch. It doesn't affect profit."
      schema={contraSchema}
      defaultValues={defaults}
      action={contraAction}
      successMessage="Transfer recorded"
    >
      {(form) => (
        <>
          <SelectField control={form.control} name="fromAccountId" label="From" options={accounts} />
          <SelectField control={form.control} name="toAccountId" label="To" options={accounts} />
          <TextField control={form.control} name="amount" label="Amount (₹)" type="number" step="0.01" min={0} />
          <TextField control={form.control} name="date" label="Date" type="date" />
          <TextField control={form.control} name="note" label="Note" placeholder="Cash deposit, slip no. …" />
        </>
      )}
    </FormDialog>
  );
}
