"use client";

import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { Input } from "@/components/ui/input";
import { savePartnerAction, setSharesAction, partnerTxnAction } from "@/modules/accounts/accounts.actions";
import {
  PARTNER_TXN_LABELS,
  PARTNER_TXN_TYPES,
  partnerSchema,
  partnerTxnSchema,
  shareSetSchema,
  type PartnerInput,
  type PartnerTxnInput,
  type ShareSetInput,
} from "@/modules/accounts/accounts.schemas";

type Opt = { value: string; label: string };

export function PartnerDialog({
  trigger,
  initial,
  users,
}: {
  trigger: React.ReactNode;
  initial?: PartnerInput;
  users: Opt[];
}) {
  const defaults: PartnerInput = initial ?? { name: "", phone: "", email: "", pan: "", userId: null, isActive: true };
  return (
    <FormDialog
      trigger={trigger}
      title={initial ? "Edit partner" : "New partner"}
      description="A partner is someone who shares in the profit. Linking their login is optional."
      schema={partnerSchema}
      defaultValues={defaults}
      action={savePartnerAction}
      successMessage="Partner saved"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="name" label="Name" />
          <TextField control={form.control} name="phone" label="Phone" inputMode="tel" />
          <TextField control={form.control} name="email" label="Email" type="email" />
          <TextField control={form.control} name="pan" label="PAN" maxLength={10} />
          <SelectField control={form.control} name="userId" label="Linked login" options={users} allowNone="None" />
          <SwitchField control={form.control} name="isActive" label="Active" />
        </>
      )}
    </FormDialog>
  );
}

function ShareFields({ form, partners }: { form: UseFormReturn<ShareSetInput, unknown, unknown>; partners: Opt[] }) {
  const { fields } = useFieldArray({ control: form.control, name: "shares" });
  const shares = useWatch({ control: form.control, name: "shares" }) ?? [];
  const total = Math.round(shares.reduce((a, s) => a + (Number(s.percent) || 0), 0) * 100) / 100;
  return (
    <>
      <TextField
        control={form.control}
        name="effectiveFrom"
        label="From date"
        type="date"
        description="The previous shares end the day before."
      />
      <div className="grid gap-2">
        <span className="text-sm font-medium">Share of profit (%)</span>
        {fields.map((f, i) => (
          <label key={f.id} className="flex items-center gap-3 text-sm">
            <span className="flex-1">{partners.find((p) => p.value === shares[i]?.partnerId)?.label}</span>
            <Input
              className="w-28 text-right"
              type="number"
              step="0.01"
              min={0}
              max={100}
              {...form.register(`shares.${i}.percent`)}
              aria-label="Percent"
            />
          </label>
        ))}
        <p
          className={
            total === 100 || total === 0 ? "text-sm text-muted-foreground" : "text-sm font-medium text-destructive"
          }
        >
          Total {total}%{" "}
          {total === 0 ? "(no shares: profit stays undistributed)" : total === 100 ? "" : "(must be 100%)"}
        </p>
      </div>
      <TextField control={form.control} name="note" label="Note" placeholder="New partnership deed, 1 April 2027" />
    </>
  );
}

export function SetSharesDialog({
  trigger,
  branch,
  partners,
  current,
  today,
}: {
  trigger: React.ReactNode;
  branch: Opt;
  partners: Opt[];
  current: Record<string, number>;
  today: string;
}) {
  const defaults: ShareSetInput = {
    branchId: branch.value,
    effectiveFrom: today,
    shares: partners.map((p) => ({ partnerId: p.value, percent: current[p.value] ?? 0 })),
    note: "",
  };
  return (
    <FormDialog
      trigger={trigger}
      title={`Shares in ${branch.label}`}
      description="Optional. If you set shares they must add up to 100%. Leave everything at 0 to stop sharing from that date."
      schema={shareSetSchema}
      defaultValues={defaults}
      action={setSharesAction}
      successMessage="Shares saved"
    >
      {(form) => <ShareFields form={form} partners={partners} />}
    </FormDialog>
  );
}

function TxnFields({
  form,
  branches,
  accounts,
}: {
  form: UseFormReturn<PartnerTxnInput, unknown, unknown>;
  branches: Opt[];
  accounts: (Opt & { branchId: string })[];
}) {
  const branchId = useWatch({ control: form.control, name: "branchId" });
  return (
    <>
      <SelectField
        control={form.control}
        name="type"
        label="Type"
        options={PARTNER_TXN_TYPES.map((t) => ({ value: t, label: PARTNER_TXN_LABELS[t] }))}
      />
      <SelectField control={form.control} name="branchId" label="Branch" options={branches} />
      <TextField control={form.control} name="amount" label="Amount (₹)" type="number" step="0.01" min={0} />
      <TextField control={form.control} name="date" label="Date" type="date" />
      <SelectField
        control={form.control}
        name="moneyAccountId"
        label="Cash / bank account"
        options={accounts.filter((a) => a.branchId === branchId)}
        allowNone="Not through our accounts"
        description="Pick the account the money came into or went out of, so it shows in the day book."
      />
      <TextField control={form.control} name="note" label="Note" />
    </>
  );
}

export function PartnerTxnDialog({
  trigger,
  partnerId,
  branches,
  accounts,
  today,
}: {
  trigger: React.ReactNode;
  partnerId: string;
  branches: Opt[];
  accounts: (Opt & { branchId: string })[];
  today: string;
}) {
  const defaults: PartnerTxnInput = {
    partnerId,
    branchId: branches[0]?.value ?? "",
    type: "DRAWING",
    amount: "" as unknown as number,
    date: today,
    moneyAccountId: null,
    note: "",
  };
  return (
    <FormDialog
      trigger={trigger}
      title="Capital or drawing"
      description="Capital brought in or taken back, or a drawing (money taken out in advance of profit)."
      schema={partnerTxnSchema}
      defaultValues={defaults}
      action={partnerTxnAction}
      successMessage="Saved"
    >
      {(form) => <TxnFields form={form} branches={branches} accounts={accounts} />}
    </FormDialog>
  );
}
