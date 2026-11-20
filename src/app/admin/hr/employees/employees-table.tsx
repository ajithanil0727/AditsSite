"use client";

import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import type { EmployeeRow } from "@/modules/hr/hr.queries";
import { EMPLOYEE_STATUS_LABELS } from "@/modules/hr/hr.schemas";

const TONE = { ACTIVE: "mint", ON_NOTICE: "peach", EXITED: "neutral" } as const;

export function EmployeesTable({
  rows,
  total,
  page,
  pageSize,
  departments,
  canSeeDeleted,
}: {
  rows: EmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
  departments: { value: string; label: string }[];
  canSeeDeleted: boolean;
}) {
  const columns: Column<EmployeeRow>[] = [
    {
      id: "name",
      header: "Employee",
      meta: { sortKey: "name" },
      cell: ({ row }) => (
        <div>
          <Link href={`/admin/hr/employees/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{row.original.code}</span> · {row.original.phone}
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Designation",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => (
        <span>
          {row.original.designation ?? "—"}
          {row.original.department && (
            <span className="block text-xs text-muted-foreground">{row.original.department}</span>
          )}
        </span>
      ),
    },
    {
      id: "branch",
      header: "Branch",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => row.original.branchCode,
    },
    {
      id: "join",
      header: "Joined",
      meta: { sortKey: "joinDate", className: "hidden lg:table-cell" },
      cell: ({ row }) => formatDate(row.original.joinDate),
    },
    {
      id: "gross",
      header: "Monthly salary",
      meta: { className: "hidden md:table-cell text-right" },
      cell: ({ row }) =>
        row.original.gross ? (
          <span className="tabular-nums">{formatINR(row.original.gross)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge tone={TONE[row.original.status]}>{EMPLOYEE_STATUS_LABELS[row.original.status]}</StatusBadge>
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
      searchPlaceholder="Name, employee ID or phone…"
      emptyText="No employees yet."
      allowShowDeleted={canSeeDeleted}
      toolbar={
        <>
          <UrlSelectFilter
            name="status"
            placeholder="Current staff"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "ON_NOTICE", label: "On notice" },
              { value: "EXITED", label: "Left" },
            ]}
          />
          <UrlSelectFilter name="department" placeholder="All departments" options={departments} />
        </>
      }
    />
  );
}
