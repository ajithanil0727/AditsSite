"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { DocStatus } from "@/components/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import type { PurchaseRow } from "@/modules/inventory/inventory.queries";

export function PurchasesTable({
  rows,
  total,
  page,
  pageSize,
  vendors,
}: {
  rows: PurchaseRow[];
  total: number;
  page: number;
  pageSize: number;
  vendors: { value: string; label: string }[];
}) {
  const columns: Column<PurchaseRow>[] = [
    {
      id: "no",
      header: "Purchase",
      cell: ({ row }) => (
        <Link href={`/admin/purchases/${row.original.id}`} className="font-mono text-sm font-medium hover:underline">
          {row.original.purchaseNo}
        </Link>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => (
        <div>
          <div>{row.original.vendor}</div>
          <div className="text-xs text-muted-foreground">
            Bill {row.original.billNo} · {formatDate(row.original.billDate)}
          </div>
        </div>
      ),
    },
    {
      id: "branch",
      header: "Branch",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => row.original.branchCode,
    },
    {
      id: "total",
      header: "Total",
      meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.total)}</span>,
    },
    {
      id: "due",
      header: "Due",
      meta: { className: "hidden text-right md:table-cell" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.status === "POSTED" && row.original.due > 0 ? formatINR(row.original.due) : "—"}
        </span>
      ),
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
      searchPlaceholder="Search purchase, bill no, vendor…"
      emptyText="No purchases yet."
      toolbar={
        <>
          <UrlSelectFilter name="vendor" placeholder="All vendors" options={vendors} />
          <UrlSelectFilter
            name="status"
            placeholder="Any status"
            options={[
              { value: "DRAFT", label: "Draft" },
              { value: "POSTED", label: "Posted" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        </>
      }
    />
  );
}
