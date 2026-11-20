"use client";

import { FileTextIcon, Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { formatINR } from "@/lib/format";
import { payExpenseAction, createExpenseAction, uploadBillAction } from "@/modules/accounts/accounts.actions";
import {
  expenseSchema,
  payExpenseSchema,
  type ExpenseInput,
  type PayExpenseInput,
} from "@/modules/accounts/accounts.schemas";
import { PaymentFields } from "../money-fields";

type Opt = { value: string; label: string };
export type MoneyOptions = {
  branches: (Opt & { registered: boolean })[];
  modes: (Opt & { requiresReference: boolean })[];
  accounts: (Opt & { branchId: string })[];
  expenseCategories: Opt[];
  vendors: Opt[];
};

function BillUpload({ value, onChange }: { value: string | null | undefined; onChange: (id: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Field>
      <FieldLabel>Bill (photo or PDF)</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const fd = new FormData();
            fd.set("file", f);
            start(async () => {
              const res = await uploadBillAction(fd);
              if (!res.ok) return void toast.error(res.error);
              onChange(res.data.id);
              setName(res.data.name);
            });
          }}
        />
        {value ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-mint px-2 py-1 text-sm text-mint-foreground">
            <FileTextIcon className="size-4" /> {name ?? "Bill attached"}
            <button type="button" aria-label="Remove bill" onClick={() => onChange(null)}>
              <XIcon className="size-3.5" />
            </button>
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => ref.current?.click()}>
            {pending ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />} Attach bill
          </Button>
        )}
      </div>
    </Field>
  );
}

function ExpenseFields({
  form,
  options,
  limit,
  canApprove,
}: {
  form: UseFormReturn<ExpenseInput, unknown, unknown>;
  options: MoneyOptions;
  limit: number;
  canApprove: boolean;
}) {
  const [branchId, amount, gst, payNow] = useWatch({
    control: form.control,
    name: ["branchId", "amount", "gstAmount", "payment.payNow"],
  });
  const total = (Number(amount) || 0) + (Number(gst) || 0);
  const needsApproval = !canApprove && total > limit;
  const registered = options.branches.find((b) => b.value === branchId)?.registered;
  // An expense waiting for approval can't be paid yet: switch "Paid already" off so its hidden fields don't block saving.
  useEffect(() => {
    if (needsApproval && payNow) form.setValue("payment.payNow", false);
  }, [needsApproval, payNow, form]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField control={form.control} name="branchId" label="Branch" options={options.branches} />
      <TextField control={form.control} name="date" label="Date" type="date" />
      <SelectField control={form.control} name="categoryId" label="Category" options={options.expenseCategories} />
      <SelectField
        control={form.control}
        name="vendorId"
        label="Paid to (vendor)"
        options={options.vendors}
        allowNone="—"
      />
      <TextareaField
        control={form.control}
        name="description"
        label="What was it for?"
        rows={2}
        className="sm:col-span-2"
      />
      <TextField control={form.control} name="amount" label="Amount before GST (₹)" type="number" step="0.01" min={0} />
      <TextField
        control={form.control}
        name="gstAmount"
        label="GST on the bill (₹)"
        type="number"
        step="0.01"
        min={0}
        description={
          registered === false
            ? "This branch has no GSTIN, so GST counts as a cost."
            : registered
              ? "Claimed as input credit, so it isn't a cost."
              : undefined
        }
      />
      <TextField control={form.control} name="billNo" label="Bill number" />
      <Controller
        control={form.control}
        name="billFileId"
        render={({ field }) => <BillUpload value={field.value} onChange={field.onChange} />}
      />
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm sm:col-span-2">
        Total {formatINR(total)}
        {needsApproval && (
          <span className="block text-peach-foreground">
            Above ₹{limit.toLocaleString("en-IN")}: it will wait for approval, so it can&apos;t be paid yet.
          </span>
        )}
      </div>
      {!needsApproval && (
        <SwitchField
          control={form.control}
          name="payment.payNow"
          label="Paid already"
          description="Records the money going out of a cash/bank account."
          className="sm:col-span-2"
        />
      )}
      {payNow && !needsApproval && (
        <>
          <PaymentFields
            control={form.control}
            branchId={branchId}
            modes={options.modes}
            accounts={options.accounts}
            modeName="payment.paymentModeId"
            accountName="payment.moneyAccountId"
          />
          <TextField control={form.control} name="payment.reference" label="Reference (UPI / cheque no.)" />
        </>
      )}
    </div>
  );
}

export function NewExpenseDialog({
  trigger,
  options,
  today,
  defaultBranchId,
  limit,
  canApprove,
}: {
  trigger: React.ReactNode;
  options: MoneyOptions;
  today: string;
  defaultBranchId: string;
  limit: number;
  canApprove: boolean;
}) {
  const defaults: ExpenseInput = {
    branchId: defaultBranchId,
    categoryId: "",
    vendorId: null,
    date: today,
    amount: "" as unknown as number,
    gstAmount: "" as unknown as number,
    description: "",
    billNo: "",
    billFileId: null,
    payment: { payNow: true, paymentModeId: options.modes[0]?.value ?? null, moneyAccountId: null, reference: "" },
  };
  return (
    <FormDialog
      wide
      trigger={trigger}
      title="New expense"
      schema={expenseSchema}
      defaultValues={defaults}
      action={async (v) => {
        const total = (Number(v.amount) || 0) + (Number(v.gstAmount) || 0);
        const pending = !canApprove && total > limit;
        return createExpenseAction(pending ? { ...v, payment: { ...v.payment, payNow: false } } : v);
      }}
      onSuccess={(d) =>
        toast.success((d as { pending: boolean }).pending ? "Expense saved. Waiting for approval." : "Expense saved")
      }
    >
      {(form) => <ExpenseFields form={form} options={options} limit={limit} canApprove={canApprove} />}
    </FormDialog>
  );
}

export function PayExpenseDialog({
  trigger,
  expense,
  options,
  today,
}: {
  trigger: React.ReactNode;
  expense: { id: string; branchId: string; total: number; description: string };
  options: MoneyOptions;
  today: string;
}) {
  const defaults: PayExpenseInput = {
    id: expense.id,
    paymentModeId: options.modes[0]?.value ?? "",
    moneyAccountId: "",
    reference: "",
    paidOn: today,
  };
  return (
    <FormDialog
      trigger={trigger}
      title={`Pay ${formatINR(expense.total)}`}
      description={expense.description}
      schema={payExpenseSchema}
      defaultValues={defaults}
      action={payExpenseAction}
      successMessage="Expense paid"
    >
      {(form) => (
        <>
          <PaymentFields
            control={form.control}
            branchId={expense.branchId}
            modes={options.modes}
            accounts={options.accounts}
            modeName="paymentModeId"
            accountName="moneyAccountId"
          />
          <TextField control={form.control} name="reference" label="Reference (UPI / cheque no.)" />
          <TextField control={form.control} name="paidOn" label="Paid on" type="date" />
        </>
      )}
    </FormDialog>
  );
}
