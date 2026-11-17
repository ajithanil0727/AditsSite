"use client";

import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatINR } from "@/lib/format";
import { PART_KINDS, PART_KIND_LABELS } from "@/modules/inventory/inventory.schemas";
import type { StockRow } from "@/modules/inventory/inventory.queries";

export function StockTable({
  rows,
  total,
  page,
  pageSize,
  categories,
}: {
  rows: StockRow[];
  total: number;
  page: number;
  pageSize: number;
  categories: { value: string; label: string }[];
}) {
  const columns: Column<StockRow>[] = [
    {
      id: "part",
      header: "Part",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.sku} · {row.original.category ?? PART_KIND_LABELS[row.original.kind]}
          </div>
        </div>
      ),
    },
    { id: "branch", header: "Branch", cell: ({ row }) => row.original.branchCode },
    {
      id: "qty",
      header: "On hand",
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          {row.original.low && <StatusBadge tone="peach">Low</StatusBadge>}
          <span className="tabular-nums">
            {row.original.qty} {row.original.unit}
          </span>
        </div>
      ),
    },
    {
      id: "reorder",
      header: "Reorder at",
      meta: { className: "hidden text-right md:table-cell" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.reorderLevel || "—"}</span>,
    },
    {
      id: "avg",
      header: "Avg cost",
      meta: { className: "hidden text-right md:table-cell" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.avgCost)}</span>,
    },
    {
      id: "value",
      header: "Value",
      meta: { className: "hidden text-right lg:table-cell" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.value)}</span>,
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
      searchPlaceholder="Search part name or SKU…"
      emptyText="No stock for this branch yet."
      toolbar={
        <>
          <UrlSelectFilter name="category" placeholder="All categories" options={categories} />
          <UrlSelectFilter
            name="kind"
            placeholder="All kinds"
            options={PART_KINDS.map((k) => ({ value: k, label: PART_KIND_LABELS[k] }))}
          />
          <UrlSelectFilter name="low" placeholder="All stock" options={[{ value: "1", label: "Low stock only" }]} />
        </>
      }
    />
  );
}
