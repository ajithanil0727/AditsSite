"use client";

import { EyeIcon } from "lucide-react";
import { DataTable, UrlSelectFilter, useUrlState, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import type { AuditRow } from "@/modules/audit/audit.queries";

const ACTION_TONE: Record<string, string> = {
  CREATE: "bg-mint text-mint-foreground",
  UPDATE: "bg-sky text-sky-foreground",
  DELETE: "bg-peach text-peach-foreground",
  RESTORE: "bg-mint text-mint-foreground",
  PERMISSION_CHANGE: "bg-lavender text-lavender-foreground",
  LOGIN_FAILED: "bg-destructive/15 text-destructive",
};

const ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "RESTORE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PERMISSION_CHANGE",
  "APPROVE",
  "REJECT",
  "EXPORT",
];

function DateFilter({ name, label }: { name: string; label: string }) {
  const { params, set } = useUrlState();
  return (
    <Input
      type="date"
      aria-label={label}
      title={label}
      className="w-[150px]"
      value={params.get(`f_${name}`) ?? ""}
      onChange={(e) => set({ [`f_${name}`]: e.target.value || null })}
    />
  );
}

function ChangesDialog({ row }: { row: AuditRow }) {
  const has = row.before != null || row.after != null;
  if (!has) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="View changes">
          <EyeIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {row.action} · {row.entityType}
          </DialogTitle>
          <DialogDescription>
            {formatDateTime(row.createdAt)} by {row.userName ?? "system"}
            {row.ipAddress ? ` from ${row.ipAddress}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60svh] gap-4 overflow-auto sm:grid-cols-2">
          {(["before", "after"] as const).map((k) => (
            <div key={k}>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">{k}</div>
              <pre className="rounded-md bg-muted p-3 text-xs break-all whitespace-pre-wrap">
                {row[k] == null ? "—" : JSON.stringify(row[k], null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuditTable({
  rows,
  total,
  page,
  pageSize,
  entityTypes,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  entityTypes: string[];
}) {
  const columns: Column<AuditRow>[] = [
    {
      id: "when",
      header: "When",
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>,
    },
    {
      id: "who",
      header: "User",
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.userName ?? "—"}</div>
          {row.original.action === "LOGIN_FAILED" && row.original.after && (
            <div className="text-xs text-muted-foreground">
              {String((row.original.after as { email?: string }).email ?? "")}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "action",
      header: "Action",
      cell: ({ row }) => (
        <Badge className={ACTION_TONE[row.original.action] ?? "bg-secondary text-secondary-foreground"}>
          {row.original.action.replace("_", " ")}
        </Badge>
      ),
    },
    {
      id: "entity",
      header: "Record",
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.entityType}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.entityId}</div>
        </div>
      ),
    },
    {
      id: "branch",
      header: "Branch",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => row.original.branchCode ?? "—",
    },
    {
      id: "view",
      header: () => <span className="sr-only">Changes</span>,
      meta: { className: "w-12" },
      cell: ({ row }) => <ChangesDialog row={row.original} />,
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
      searchPlaceholder="Search user or record id…"
      emptyText="No audit entries match."
      toolbar={
        <>
          <UrlSelectFilter
            name="action"
            placeholder="All actions"
            options={ACTIONS.map((a) => ({ value: a, label: a.replace("_", " ") }))}
          />
          <UrlSelectFilter
            name="entity"
            placeholder="All records"
            options={entityTypes.map((e) => ({ value: e, label: e }))}
          />
          <DateFilter name="from" label="From date" />
          <DateFilter name="to" label="To date" />
        </>
      }
    />
  );
}
