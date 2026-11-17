"use client";

import { PencilIcon } from "lucide-react";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { PART_KINDS, PART_KIND_LABELS } from "@/modules/inventory/inventory.schemas";
import type { PartRow } from "@/modules/inventory/inventory.queries";
import { PartFormDialog, type PartFormOptions } from "./part-form-dialog";

export function PartsTable({
  rows,
  total,
  page,
  pageSize,
  options,
  canManage,
}: {
  rows: PartRow[];
  total: number;
  page: number;
  pageSize: number;
  options: PartFormOptions;
  canManage: boolean;
}) {
  const columns: Column<PartRow>[] = [
    {
      id: "sku",
      header: "SKU",
      meta: { sortKey: "sku" },
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
    },
    {
      id: "name",
      header: "Name",
      meta: { sortKey: "name" },
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.category ?? PART_KIND_LABELS[row.original.kind]}
          </div>
        </div>
      ),
    },
    {
      id: "price",
      header: "Sale price",
      meta: { className: "hidden text-right md:table-cell" },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.salePrice != null ? formatINR(row.original.salePrice) : "—"}</span>
      ),
    },
    {
      id: "tax",
      header: "HSN · GST",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) =>
        `${row.original.hsn ?? "—"} · ${row.original.taxRate != null ? `${row.original.taxRate}%` : "—"}`,
    },
    {
      id: "onHand",
      header: "On hand",
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.onHand} {row.original.unit}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) =>
        row.original.isActive ? (
          <StatusBadge tone="mint">Active</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Inactive</StatusBadge>
        ),
    },
    {
      id: "edit",
      header: () => <span className="sr-only">Edit</span>,
      meta: { className: "w-12 text-right" },
      cell: ({ row }) =>
        canManage && (
          <PartFormDialog
            initial={row.original.form}
            options={options}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.name}`}>
                <PencilIcon />
              </Button>
            }
          />
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
      searchPlaceholder="Search name, SKU, model…"
      emptyText="No parts yet."
      toolbar={
        <>
          <UrlSelectFilter name="category" placeholder="All categories" options={options.categories} />
          <UrlSelectFilter
            name="kind"
            placeholder="All kinds"
            options={PART_KINDS.map((k) => ({ value: k, label: PART_KIND_LABELS[k] }))}
          />
        </>
      }
    />
  );
}
