"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { DocStatus } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import type { TransferRow } from "@/modules/inventory/inventory.queries";

export function TransfersTable({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: TransferRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const columns: Column<TransferRow>[] = [
    {
      id: "no",
      header: "Transfer",
      cell: ({ row }) => (
        <Link
          href={`/admin/inventory/transfers/${row.original.id}`}
          className="font-mono text-sm font-medium hover:underline"
        >
          {row.original.transferNo}
        </Link>
      ),
    },
    { id: "route", header: "From → To", cell: ({ row }) => `${row.original.from} → ${row.original.to}` },
    {
      id: "items",
      header: "Lines",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => row.original.items,
    },
    {
      id: "date",
      header: "Created",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    { id: "status", header: "Status", cell: ({ row }) => <DocStatus status={row.original.status} /> },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      getRowId={(r) => r.id}
      searchPlaceholder="Search transfer no…"
      emptyText="No transfers yet."
      toolbar={
        <UrlSelectFilter
          name="status"
          placeholder="Any status"
          options={[
            { value: "DRAFT", label: "Draft" },
            { value: "DISPATCHED", label: "In transit" },
            { value: "RECEIVED", label: "Received" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
      }
    />
  );
}
