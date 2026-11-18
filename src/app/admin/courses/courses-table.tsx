"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatINR } from "@/lib/format";
import type { CourseRow } from "@/modules/courses/courses.queries";

export function CoursesTable({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: CourseRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const columns: Column<CourseRow>[] = [
    {
      id: "name",
      header: "Course",
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/courses/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">{row.original.code}</div>
        </div>
      ),
    },
    {
      id: "duration",
      header: "Duration",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => row.original.duration,
    },
    {
      id: "fee",
      header: "Fee",
      meta: { className: "text-right" },
      cell: ({ row }) => <span className="tabular-nums">{formatINR(row.original.fee)}</span>,
    },
    {
      id: "batches",
      header: "Open batches",
      meta: { className: "hidden md:table-cell text-right" },
      cell: ({ row }) => row.original.openBatches,
    },
    {
      id: "students",
      header: "Active students",
      meta: { className: "hidden md:table-cell text-right" },
      cell: ({ row }) => row.original.activeStudents,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <StatusBadge tone="mint">Active</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Inactive</StatusBadge>
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
      searchPlaceholder="Search course name or code…"
      emptyText="No courses yet."
      toolbar={
        <UrlSelectFilter
          name="status"
          placeholder="Active courses"
          options={[
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ]}
        />
      }
    />
  );
}
