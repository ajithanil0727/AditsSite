"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { formatDate } from "@/lib/format";
import type { CustomerRow } from "@/modules/service/jobs.queries";

export function CustomersTable({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const columns: Column<CustomerRow>[] = [
    {
      id: "name",
      header: "Customer",
      cell: ({ row }) => (
        <Link href={`/admin/service/customers/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    { id: "phone", header: "Phone", cell: ({ row }) => row.original.phone },
    {
      id: "gstin",
      header: "GSTIN",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.gstin ?? "—"}</span>,
    },
    {
      id: "devices",
      header: "Devices",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => row.original.devices,
    },
    {
      id: "last",
      header: "Last visit",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => (row.original.lastVisit ? formatDate(row.original.lastVisit) : "—"),
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
      searchPlaceholder="Name, phone, IMEI…"
      emptyText="No customers yet."
    />
  );
}
