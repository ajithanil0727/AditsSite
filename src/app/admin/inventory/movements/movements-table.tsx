"use client";

import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { formatDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MovementRow } from "@/modules/inventory/inventory.queries";

const LABELS: Record<string, string> = {
  OPENING: "Opening",
  PURCHASE: "Purchase",
  PURCHASE_RETURN: "Purchase return",
  JOB_ISSUE: "Issued to job",
  JOB_RETURN: "Returned from job",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  INTERNAL_USE: "Internal use",
};

export function MovementsTable({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const columns: Column<MovementRow>[] = [
    {
      id: "at",
      header: "When",
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDateTime(row.original.at)}</span>,
    },
    {
      id: "part",
      header: "Part",
      cell: ({ row }) => (
        <div>
          <div className="text-sm font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.sku} · {row.original.branchCode}
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{LABELS[row.original.type] ?? row.original.type}</div>
          {row.original.note && (
            <div className="max-w-56 truncate text-xs text-muted-foreground">{row.original.note}</div>
          )}
        </div>
      ),
    },
    {
      id: "qty",
      header: "Qty",
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <span className={cn("tabular-nums", row.original.qty < 0 ? "text-destructive" : "text-success")}>
          {row.original.qty > 0 ? "+" : ""}
          {row.original.qty} {row.original.unit}
        </span>
      ),
    },
    {
      id: "cost",
      header: "Unit cost",
      meta: { className: "hidden text-right md:table-cell" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.unitCost)}</span>,
    },
    {
      id: "bal",
      header: "Balance",
      meta: { className: "hidden text-right md:table-cell" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.balanceAfter}</span>,
    },
    {
      id: "by",
      header: "By",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => row.original.userName ?? "—",
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
      searchPlaceholder="Search part…"
      toolbar={
        <UrlSelectFilter
          name="type"
          placeholder="All types"
          options={Object.entries(LABELS).map(([value, label]) => ({ value, label }))}
        />
      }
    />
  );
}
