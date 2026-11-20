"use client";

import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";
import { deleteUserAction, restoreUserAction } from "@/modules/users/users.actions";
import type { UserRow } from "@/modules/users/users.queries";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { UserFormDialog, type UserFormOptions } from "./user-form-dialog";

export function UsersTable({
  rows,
  total,
  page,
  pageSize,
  options,
  perms,
}: {
  rows: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  options: UserFormOptions;
  perms: { update: boolean; delete: boolean; resetPassword: boolean };
}) {
  const columns: Column<UserRow>[] = [
    {
      id: "name",
      header: "Name",
      meta: { sortKey: "name" },
      cell: ({ row }) => (
        <div>
          <div className="font-medium">
            {row.original.name} {row.original.isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
          </div>
          <div className="text-xs text-muted-foreground">{row.original.email}</div>
        </div>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roleNames.map((r) => (
            <Badge key={r} className="bg-lavender text-lavender-foreground">
              {r}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "branches",
      header: "Branches",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => <span className="text-sm">{row.original.branchCodes.join(", ") || "—"}</span>,
    },
    {
      id: "lastLoginAt",
      header: "Last sign-in",
      meta: { sortKey: "lastLoginAt", className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.original.lastLoginAt) || "Never"}</span>
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
        const u = row.original;
        if (!perms.update && !perms.delete && !perms.resetPassword) return null;
        // Owners' and super admins' accounts are managed only by the super admin.
        if (u.locked)
          return (
            <span className="text-xs text-muted-foreground" title="Only a super admin can change this account">
              Protected
            </span>
          );
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {perms.update && !u.deleted && (
                <UserFormDialog
                  initial={u.form}
                  options={options}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <PencilIcon /> Edit
                    </DropdownMenuItem>
                  }
                />
              )}
              {perms.resetPassword && !u.deleted && (
                <ResetPasswordDialog
                  userId={u.id}
                  name={u.name}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <KeyRoundIcon /> Reset password
                    </DropdownMenuItem>
                  }
                />
              )}
              {perms.delete &&
                !u.isSelf &&
                (u.deleted ? (
                  <ConfirmAction
                    title={`Restore ${u.name}?`}
                    description="The user will be able to sign in again if active."
                    confirmLabel="Restore"
                    successMessage="User restored"
                    action={() => restoreUserAction({ id: u.id })}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <RotateCcwIcon /> Restore
                      </DropdownMenuItem>
                    }
                  />
                ) : (
                  <ConfirmAction
                    title={`Delete ${u.name}?`}
                    description="They will be signed out and can't sign in. You can restore the account later."
                    confirmLabel="Delete"
                    destructive
                    successMessage="User deleted"
                    action={() => deleteUserAction({ id: u.id })}
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
      searchPlaceholder="Search name, email, phone…"
      allowShowDeleted={perms.delete}
      emptyText="No users found."
      toolbar={
        <>
          <UrlSelectFilter
            name="role"
            placeholder="All roles"
            options={options.roles.map((r) => ({ value: r.id, label: r.name }))}
          />
          <UrlSelectFilter
            name="status"
            placeholder="Any status"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </>
      }
    />
  );
}
