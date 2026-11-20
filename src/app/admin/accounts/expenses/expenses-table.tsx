"use client";

import { CheckIcon, FileTextIcon, MoreHorizontalIcon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextareaField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatINR } from "@/lib/format";
import { cancelExpenseAction, decideExpenseAction } from "@/modules/accounts/accounts.actions";
import type { ExpenseRow } from "@/modules/accounts/accounts.queries";
import { cancelEntrySchema } from "@/modules/accounts/accounts.schemas";
import { PayExpenseDialog, type MoneyOptions } from "./expense-dialogs";

const STATUS = {
  PENDING: { label: "Waiting for approval", tone: "peach" },
  APPROVED: { label: "Approved", tone: "mint" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

function Decide({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const go = (approve: boolean) =>
    start(async () => {
      const res = await decideExpenseAction({ id, approve, note: null });
      if (res.ok) toast.success(approve ? "Approved" : "Rejected");
      else toast.error(res.error);
    });
  return (
    <div className="flex gap-1">
      <Button size="xs" variant="outline" disabled={pending} onClick={() => go(true)}>
        <CheckIcon /> Approve
      </Button>
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => go(false)} aria-label="Reject">
        <XIcon />
      </Button>
    </div>
  );
}

export function ExpensesTable({
  rows,
  total,
  page,
  pageSize,
  sumTotal,
  options,
  today,
  me,
  perms,
}: {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
  sumTotal: number;
  options: MoneyOptions;
  today: string;
  me: string;
  perms: { approve: boolean; pay: boolean; create: boolean };
}) {
  const columns: Column<ExpenseRow>[] = [
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
    },
    {
      id: "what",
      header: "Expense",
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="min-w-48">
            <div className="font-medium">{e.description}</div>
            <div className="text-xs text-muted-foreground">
              {e.category}
              {e.vendor ? ` · ${e.vendor}` : ""}
              {e.billNo ? ` · Bill ${e.billNo}` : ""} · {e.branchCode}
              {e.billFileId && (
                <a
                  href={`/api/files/${e.billFileId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  <FileTextIcon className="size-3" /> bill
                </a>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "total",
      header: "Total",
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatINR(row.original.total)}
          {row.original.gstAmount > 0 && (
            <span className="block text-xs text-muted-foreground">GST {formatINR(row.original.gstAmount)}</span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const e = row.original;
        if (e.status === "PENDING" && perms.approve && e.requestedById !== me) return <Decide id={e.id} />;
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</StatusBadge>
            {e.status === "APPROVED" && (
              <span className="text-xs text-muted-foreground">
                {e.paid ? `Paid · ${e.paidFrom ?? ""}` : "Not paid yet"}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "by",
      header: "Entered by",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.requestedBy}
          {row.original.approvedBy && row.original.approvedBy !== row.original.requestedBy && (
            <span className="block text-xs text-muted-foreground">Approved by {row.original.approvedBy}</span>
          )}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { className: "w-10" },
      cell: ({ row }) => {
        const e = row.original;
        const canPay = perms.pay && e.status === "APPROVED" && !e.paid;
        const canCancel =
          (perms.approve || (e.requestedById === me && e.status === "PENDING")) &&
          (e.status === "PENDING" || e.status === "APPROVED");
        if (!canPay && !canCancel) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canPay && (
                <PayExpenseDialog
                  expense={e}
                  options={options}
                  today={today}
                  trigger={<DropdownMenuItem onSelect={(ev) => ev.preventDefault()}>Pay</DropdownMenuItem>}
                />
              )}
              {canCancel && (
                <FormDialog
                  trigger={
                    <DropdownMenuItem variant="destructive" onSelect={(ev) => ev.preventDefault()}>
                      Cancel entry
                    </DropdownMenuItem>
                  }
                  title="Cancel this expense?"
                  description={
                    e.paid
                      ? "It was paid, so the money is added back to the account in the day book."
                      : "It won't count in the profit report."
                  }
                  schema={cancelEntrySchema}
                  defaultValues={{ id: e.id, reason: "" }}
                  action={cancelExpenseAction}
                  submitLabel="Cancel expense"
                  successMessage="Expense cancelled"
                  destructive
                >
                  {(form) => <TextareaField control={form.control} name="reason" label="Why?" rows={2} />}
                </FormDialog>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
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
        searchPlaceholder="Description or bill no…"
        emptyText="No expenses found."
        toolbar={
          <>
            <UrlSelectFilter
              name="status"
              placeholder="All (not cancelled)"
              options={[
                { value: "PENDING", label: "Waiting for approval" },
                { value: "UNPAID", label: "Approved, not paid" },
                { value: "APPROVED", label: "Approved" },
                { value: "REJECTED", label: "Rejected" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
            <UrlSelectFilter name="category" placeholder="All categories" options={options.expenseCategories} />
          </>
        }
      />
      <p className="mt-3 text-right text-sm text-muted-foreground">
        Total of the listed expenses:{" "}
        <span className="font-medium text-foreground tabular-nums">{formatINR(sumTotal)}</span>
      </p>
    </>
  );
}
