"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { BATCH_STATUSES, BATCH_STATUS_LABELS } from "@/modules/courses/courses.schemas";
import type { BatchRow } from "@/modules/courses/courses.queries";

const TONE = { PLANNED: "sky", ONGOING: "mint", COMPLETED: "lavender", CANCELLED: "neutral" } as const;

export function BatchesTable({
  rows,
  total,
  page,
  pageSize,
  courses,
}: {
  rows: BatchRow[];
  total: number;
  page: number;
  pageSize: number;
  courses: { value: string; label: string }[];
}) {
  const columns: Column<BatchRow>[] = [
    {
      id: "name",
      header: "Batch",
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/batches/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">
            {row.original.code} · {row.original.branchCode}
          </div>
        </div>
      ),
    },
    {
      id: "course",
      header: "Course",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => row.original.course,
    },
    {
      id: "timing",
      header: "Timing",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => `${row.original.timing}${row.original.days ? ` · ${row.original.days}` : ""}`,
    },
    {
      id: "trainer",
      header: "Trainer",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => row.original.trainer ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "start",
      header: "Starts",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      id: "seats",
      header: "Students",
      meta: { className: "text-right" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.students}/{row.original.capacity}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge tone={TONE[row.original.status]}>{BATCH_STATUS_LABELS[row.original.status]}</StatusBadge>
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
      searchPlaceholder="Search batch name or code…"
      emptyText="No batches."
      toolbar={
        <>
          <UrlSelectFilter name="course" placeholder="All courses" options={courses} />
          <UrlSelectFilter
            name="status"
            placeholder="Planned & ongoing"
            options={BATCH_STATUSES.map((s) => ({ value: s, label: BATCH_STATUS_LABELS[s] }))}
          />
        </>
      }
    />
  );
}
