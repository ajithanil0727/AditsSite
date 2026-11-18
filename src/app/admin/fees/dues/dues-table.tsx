"use client";

import Link from "next/link";
import { PhoneIcon } from "lucide-react";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import type { DueRow } from "@/modules/students/students.queries";

export function DuesTable({
  rows,
  total,
  page,
  pageSize,
  courses,
}: {
  rows: DueRow[];
  total: number;
  page: number;
  pageSize: number;
  courses: { value: string; label: string }[];
}) {
  const columns: Column<DueRow>[] = [
    {
      id: "student",
      header: "Student",
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/students/${row.original.studentId}`} className="font-medium hover:underline">
            {row.original.student}
          </Link>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{row.original.studentCode}</span> · {row.original.course} ·{" "}
            {row.original.branchCode}
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => (
        <a href={`tel:${row.original.phone}`} className="inline-flex items-center gap-1 hover:underline">
          <PhoneIcon className="size-3" />
          {row.original.phone}
        </a>
      ),
    },
    {
      id: "label",
      header: "Instalment",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => row.original.label,
    },
    {
      id: "dueDate",
      header: "Due date",
      cell: ({ row }) => (
        <span>
          {formatDate(row.original.dueDate)}
          {row.original.overdueDays > 0 && (
            <StatusBadge tone="danger" className="ml-2">
              {row.original.overdueDays} d late
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: "due",
      header: "Due",
      meta: { className: "text-right" },
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatINR(row.original.due)}</span>,
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
      searchPlaceholder="Student name, phone, ID…"
      emptyText="Nothing due. 🎉"
      toolbar={
        <>
          <UrlSelectFilter
            name="when"
            placeholder="Overdue"
            options={[
              { value: "week", label: "Due within a week" },
              { value: "all", label: "All unpaid" },
            ]}
          />
          <UrlSelectFilter name="course" placeholder="All courses" options={courses} />
        </>
      }
    />
  );
}
