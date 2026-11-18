"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatINR } from "@/lib/format";
import type { StudentRow } from "@/modules/students/students.queries";

export const ENROLL_TONE = { ACTIVE: "mint", ON_HOLD: "peach", COMPLETED: "lavender", DROPPED: "neutral" } as const;
export const ENROLL_LABEL = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  DROPPED: "Dropped",
} as const;

export function StudentsTable({
  rows,
  total,
  page,
  pageSize,
  courses,
}: {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  courses: { value: string; label: string }[];
}) {
  const columns: Column<StudentRow>[] = [
    {
      id: "name",
      header: "Student",
      meta: { sortKey: "name" },
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/students/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{row.original.studentCode}</span> · {row.original.phone}
          </div>
        </div>
      ),
    },
    {
      id: "course",
      header: "Course / batch",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) =>
        row.original.course ? (
          <span>
            {row.original.course}
            {row.original.batch ? <span className="text-muted-foreground"> · {row.original.batch}</span> : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "branch",
      header: "Branch",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => row.original.branchCode,
    },
    {
      id: "due",
      header: "Fee due",
      meta: { className: "text-right" },
      cell: ({ row }) =>
        row.original.due > 0 ? (
          <span className={row.original.overdue > 0 ? "font-medium text-destructive tabular-nums" : "tabular-nums"}>
            {formatINR(row.original.due)}
            {row.original.overdue > 0 && (
              <span className="block text-xs">{formatINR(row.original.overdue)} overdue</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.status ? (
          <StatusBadge tone={ENROLL_TONE[row.original.status]}>{ENROLL_LABEL[row.original.status]}</StatusBadge>
        ) : null,
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
      searchPlaceholder="Name, phone, student ID…"
      emptyText="No students found."
      toolbar={
        <>
          <UrlSelectFilter name="course" placeholder="All courses" options={courses} />
          <UrlSelectFilter
            name="status"
            placeholder="Any status"
            options={Object.entries(ENROLL_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </>
      }
    />
  );
}
