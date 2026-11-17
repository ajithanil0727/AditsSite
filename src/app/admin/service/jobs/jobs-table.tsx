"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge, toTone } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { JobRow } from "@/modules/service/jobs.queries";
import { PRIORITIES, PRIORITY_LABELS } from "@/modules/service/service.schemas";

const PRIORITY_TONE = { LOW: "neutral", NORMAL: "sky", HIGH: "peach", URGENT: "danger" } as const;

export function JobsTable({
  rows,
  total,
  page,
  pageSize,
  statusOptions,
  engineers,
}: {
  rows: JobRow[];
  total: number;
  page: number;
  pageSize: number;
  statusOptions: { value: string; label: string }[];
  engineers: { value: string; label: string }[];
}) {
  const columns: Column<JobRow>[] = [
    {
      id: "job",
      header: "Job",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/admin/service/jobs/${row.original.id}`}
            className="font-mono text-sm font-medium hover:underline"
          >
            {row.original.jobNo}
          </Link>
          {row.original.isWarrantyJob && (
            <StatusBadge tone="lavender" className="ml-2">
              Warranty
            </StatusBadge>
          )}
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
      id: "device",
      header: "Device",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => row.original.device,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge tone={toTone(row.original.tone)}>{row.original.status}</StatusBadge>,
    },
    {
      id: "engineer",
      header: "Engineer",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => row.original.engineer ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      id: "priority",
      header: "Priority",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <StatusBadge tone={PRIORITY_TONE[row.original.priority]}>{PRIORITY_LABELS[row.original.priority]}</StatusBadge>
      ),
    },
    {
      id: "receivedAt",
      header: "Received",
      meta: { sortKey: "receivedAt", className: "hidden sm:table-cell" },
      cell: ({ row }) => formatDate(row.original.receivedAt),
    },
    {
      id: "estimatedAt",
      header: "Promised",
      meta: { sortKey: "estimatedAt", className: "hidden sm:table-cell" },
      cell: ({ row }) => (
        <span className={cn(row.original.overdue && "font-medium text-destructive")}>
          {row.original.estimatedAt ? formatDate(row.original.estimatedAt) : "—"}
          {row.original.overdue && " · overdue"}
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
      searchPlaceholder="Job no, phone, name, IMEI…"
      emptyText="No job cards match."
      toolbar={
        <>
          <UrlSelectFilter
            name="status"
            placeholder="Open jobs"
            options={[{ value: "all", label: "All jobs" }, ...statusOptions]}
          />
          {engineers.length > 0 && (
            <UrlSelectFilter
              name="engineer"
              placeholder="All engineers"
              options={[{ value: "none", label: "Unassigned" }, ...engineers]}
            />
          )}
          <UrlSelectFilter
            name="priority"
            placeholder="Any priority"
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          />
          <UrlSelectFilter name="overdue" placeholder="Any date" options={[{ value: "1", label: "Overdue only" }]} />
        </>
      }
    />
  );
}
