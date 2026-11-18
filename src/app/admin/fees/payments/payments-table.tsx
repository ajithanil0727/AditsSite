"use client";

import Link from "next/link";
import { PrinterIcon } from "lucide-react";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/format";
import { cancelReceiptAction } from "@/modules/students/students.actions";
import { cancelReceiptSchema } from "@/modules/students/students.schemas";
import type { FeePaymentRow } from "@/modules/students/students.queries";

export function PaymentsTable({
  rows,
  total,
  page,
  pageSize,
  canCancel,
}: {
  rows: FeePaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  canCancel: boolean;
}) {
  const columns: Column<FeePaymentRow>[] = [
    {
      id: "receipt",
      header: "Receipt",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/print/fee-receipt/${row.original.id}`}
            target="_blank"
            className="font-mono text-sm hover:underline"
          >
            {row.original.receiptNo}
          </Link>
          <div className="text-xs text-muted-foreground">
            {formatDate(row.original.paidAt)} · {row.original.branchCode}
          </div>
        </div>
      ),
    },
    {
      id: "student",
      header: "Student",
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/students/${row.original.studentId}`} className="hover:underline">
            {row.original.student}
          </Link>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{row.original.studentCode}</span> · {row.original.course}
          </div>
        </div>
      ),
    },
    {
      id: "mode",
      header: "Mode",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => `${row.original.mode}${row.original.reference ? ` · ${row.original.reference}` : ""}`,
    },
    {
      id: "by",
      header: "Collected by",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => row.original.by,
    },
    {
      id: "amount",
      header: "Amount",
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <span className={row.original.cancelled ? "text-muted-foreground tabular-nums line-through" : "tabular-nums"}>
          {formatINR(row.original.amount)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-40 text-right" },
      cell: ({ row }) =>
        row.original.cancelled ? (
          <StatusBadge tone="danger" className="max-w-40 truncate">
            Cancelled
          </StatusBadge>
        ) : (
          <span className="flex justify-end gap-1">
            <Button asChild size="icon-sm" variant="ghost" aria-label="Print receipt">
              <Link href={`/print/fee-receipt/${row.original.id}`} target="_blank">
                <PrinterIcon />
              </Link>
            </Button>
            {canCancel && (
              <FormDialog
                trigger={
                  <Button size="sm" variant="ghost" className="text-destructive">
                    Cancel
                  </Button>
                }
                title={`Cancel receipt ${row.original.receiptNo}?`}
                description="Use this for a receipt entered by mistake. The instalments become due again and the day book is reversed. The number stays used."
                schema={cancelReceiptSchema}
                defaultValues={{ paymentId: row.original.id, reason: "" }}
                action={cancelReceiptAction}
                submitLabel="Cancel receipt"
                destructive
                successMessage="Receipt cancelled"
              >
                {(form) => <TextField control={form.control} name="reason" label="Reason" />}
              </FormDialog>
            )}
          </span>
        ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      getRowId={(r) => r.id}
      searchPlaceholder="Receipt no, student, phone, ID…"
      emptyText="No receipts."
      toolbar={
        <UrlSelectFilter
          name="status"
          placeholder="Valid receipts"
          options={[
            { value: "cancelled", label: "Cancelled" },
            { value: "all", label: "All" },
          ]}
        />
      }
    />
  );
}
