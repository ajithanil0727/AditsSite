"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/format";
import { cancelIncomeAction, createIncomeAction } from "@/modules/accounts/accounts.actions";
import type { IncomeRow } from "@/modules/accounts/accounts.queries";
import { cancelEntrySchema, incomeSchema, type IncomeInput } from "@/modules/accounts/accounts.schemas";
import { PaymentFields } from "../money-fields";

type Opt = { value: string; label: string };
type Options = {
  branches: Opt[];
  modes: Opt[];
  accounts: (Opt & { branchId: string })[];
  incomeCategories: Opt[];
};

function Fields({ form, options }: { form: UseFormReturn<IncomeInput, unknown, unknown>; options: Options }) {
  const branchId = useWatch({ control: form.control, name: "branchId" });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField control={form.control} name="branchId" label="Branch" options={options.branches} />
      <TextField control={form.control} name="date" label="Date" type="date" />
      <SelectField control={form.control} name="categoryId" label="Category" options={options.incomeCategories} />
      <TextField control={form.control} name="amount" label="Amount (₹)" type="number" step="0.01" min={0} />
      <TextareaField control={form.control} name="description" label="Details" rows={2} className="sm:col-span-2" />
      <PaymentFields
        control={form.control}
        branchId={branchId}
        modes={options.modes}
        accounts={options.accounts}
        modeName="paymentModeId"
        accountName="moneyAccountId"
      />
    </div>
  );
}

export function NewIncomeDialog({
  options,
  today,
  defaultBranchId,
}: {
  options: Options;
  today: string;
  defaultBranchId: string;
}) {
  const defaults: IncomeInput = {
    branchId: defaultBranchId,
    categoryId: "",
    date: today,
    amount: "" as unknown as number,
    description: "",
    paymentModeId: options.modes[0]?.value ?? "",
    moneyAccountId: "",
  };
  return (
    <FormDialog
      wide
      trigger={
        <Button>
          <PlusIcon /> Add income
        </Button>
      }
      title="Other income"
      description="Money received that isn't a course fee or a repair (those are recorded automatically)."
      schema={incomeSchema}
      defaultValues={defaults}
      action={createIncomeAction}
      successMessage="Income saved"
    >
      {(form) => <Fields form={form} options={options} />}
    </FormDialog>
  );
}

export function IncomeTable({
  rows,
  total,
  page,
  pageSize,
  sumTotal,
  categories,
  canCancel,
}: {
  rows: IncomeRow[];
  total: number;
  page: number;
  pageSize: number;
  sumTotal: number;
  categories: Opt[];
  canCancel: boolean;
}) {
  const columns: Column<IncomeRow>[] = [
    { id: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    {
      id: "what",
      header: "Income",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.description}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.category} · {row.original.branchCode} · {row.original.mode} into {row.original.account}
          </div>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.amount)}</span>,
    },
    { id: "by", header: "Entered by", meta: { className: "hidden md:table-cell" }, cell: ({ row }) => row.original.by },
    {
      id: "actions",
      header: "",
      meta: { className: "w-10" },
      cell: ({ row }) =>
        canCancel && (
          <FormDialog
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Cancel entry">
                <Trash2Icon />
              </Button>
            }
            title="Cancel this income entry?"
            description="The amount is taken back out of the account in the day book."
            schema={cancelEntrySchema}
            defaultValues={{ id: row.original.id, reason: "" }}
            action={cancelIncomeAction}
            submitLabel="Cancel entry"
            successMessage="Entry cancelled"
            destructive
          >
            {(form) => <TextareaField control={form.control} name="reason" label="Why?" rows={2} />}
          </FormDialog>
        ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        getRowId={(r) => r.id}
        searchPlaceholder="Search details…"
        emptyText="No other income recorded."
        toolbar={<UrlSelectFilter name="category" placeholder="All categories" options={categories} />}
      />
      <p className="mt-3 text-right text-sm text-muted-foreground">
        Total of the listed entries:{" "}
        <span className="font-medium text-foreground tabular-nums">{formatINR(sumTotal)}</span>
      </p>
    </>
  );
}
