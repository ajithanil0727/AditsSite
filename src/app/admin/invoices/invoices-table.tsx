"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { DocStatus, StatusBadge } from "@/components/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import type { InvoiceRow } from "@/modules/invoices/invoices.queries";

export function InvoicesTable({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const columns: Column<InvoiceRow>[] = [
    {
      id: "no",
      header: "Invoice",
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/invoices/${row.original.id}`} className="font-mono text-sm font-medium hover:underline">
            {row.original.invoiceNo}
          </Link>
          <div className="text-xs text-muted-foreground">
            {formatDate(row.original.date)} · {row.original.kind === "TAX_INVOICE" ? "Tax invoice" : "Non-GST"}
          </div>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <div>{row.original.customer}</div>
          <div className="text-xs text-muted-foreground">{row.original.phone}</div>
        </div>
      ),
    },
    {
      id: "job",
      header: "Job",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) =>
        row.original.jobId ? (
          <Link href={`/admin/service/jobs/${row.original.jobId}`} className="font-mono text-xs hover:underline">
            {row.original.jobNo}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "total",
      header: "Total",
      meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.total)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.status === "ISSUED" ? (
          row.original.due > 0.001 ? (
            <StatusBadge tone="peach">{formatINR(row.original.due)} due</StatusBadge>
          ) : (
            <StatusBadge tone="mint">Paid</StatusBadge>
          )
        ) : (
          <DocStatus status={row.original.status} />
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
      searchPlaceholder="Invoice no, customer, phone, job…"
      emptyText="No invoices."
      toolbar={
        <>
          <UrlSelectFilter
            name="status"
            placeholder="All invoices"
            options={[
              { value: "due", label: "Dues (unpaid)" },
              { value: "ISSUED", label: "Issued" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
          <UrlSelectFilter
            name="kind"
            placeholder="All types"
            options={[
              { value: "TAX_INVOICE", label: "Tax invoice" },
              { value: "NON_GST_INVOICE", label: "Non-GST" },
            ]}
          />
        </>
      }
    />
  );
}
