"use client";

import { MoreHorizontalIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { stateName } from "@/lib/india-states";
import { deleteBranchAction, restoreBranchAction } from "@/modules/branches/branches.actions";
import { BRANCH_KINDS, BRANCH_KIND_LABELS } from "@/modules/branches/branches.schemas";
import type { BranchRow } from "@/modules/branches/branches.queries";
import { BranchFormDialog } from "./branch-form-dialog";

type GstOption = { id: string; label: string; stateCode: string };

export function BranchesTable({
  rows,
  total,
  page,
  pageSize,
  gstOptions,
  canEdit,
  canDelete,
}: {
  rows: BranchRow[];
  total: number;
  page: number;
  pageSize: number;
  gstOptions: GstOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const columns: Column<BranchRow>[] = [
    {
      id: "code",
      header: "Code",
      accessorKey: "code",
      meta: { sortKey: "code" },
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span>,
    },
    { id: "name", header: "Name", accessorKey: "name", meta: { sortKey: "name" } },
    { id: "kind", header: "Type", meta: { sortKey: "kind" }, cell: ({ row }) => BRANCH_KIND_LABELS[row.original.kind] },
    {
      id: "city",
      header: "City",
      meta: { sortKey: "city", className: "hidden md:table-cell" },
      cell: ({ row }) => `${row.original.city}, ${stateName(row.original.stateCode)}`,
    },
    {
      id: "gst",
      header: "GSTIN",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) =>
        row.original.gstin ? (
          <span className="font-mono text-xs">{row.original.gstin}</span>
        ) : (
          <Badge variant="outline">Unregistered</Badge>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.deleted ? (
          <Badge variant="destructive">Deleted</Badge>
        ) : row.original.isActive ? (
          <Badge className="bg-mint text-mint-foreground">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-12 text-right" },
      cell: ({ row }) => {
        const b = row.original;
        if (!canEdit && !canDelete) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${b.name}`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && !b.deleted && (
                <BranchFormDialog
                  initial={b.form}
                  gstOptions={gstOptions}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <PencilIcon /> Edit
                    </DropdownMenuItem>
                  }
                />
              )}
              {canDelete &&
                (b.deleted ? (
                  <ConfirmAction
                    title={`Restore ${b.name}?`}
                    description="The branch will be visible again."
                    confirmLabel="Restore"
                    successMessage="Branch restored"
                    action={() => restoreBranchAction({ id: b.id })}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <RotateCcwIcon /> Restore
                      </DropdownMenuItem>
                    }
                  />
                ) : (
                  <ConfirmAction
                    title={`Delete ${b.name}?`}
                    description="The branch will be hidden everywhere. You can restore it later."
                    confirmLabel="Delete"
                    destructive
                    successMessage="Branch deleted"
                    action={() => deleteBranchAction({ id: b.id })}
                    trigger={
                      <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                        <Trash2Icon /> Delete
                      </DropdownMenuItem>
                    }
                  />
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
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
      searchPlaceholder="Search name, code, city…"
      allowShowDeleted={canDelete}
      emptyText="No branches found."
      toolbar={
        <UrlSelectFilter
          name="kind"
          placeholder="All types"
          options={BRANCH_KINDS.map((k) => ({ value: k, label: BRANCH_KIND_LABELS[k] }))}
        />
      }
    />
  );
}
