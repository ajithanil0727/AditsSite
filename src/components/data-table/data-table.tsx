"use client";

import { tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Paging, sorting and search all live in the URL and run on the server; the table only renders. */
export const tableFeaturesNone = tableFeatures({});
export type Features = typeof tableFeaturesNone;
export type Column<T extends RowData> = ColumnDef<Features, T> & {
  meta?: { sortKey?: string; className?: string };
};

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (updates: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { params, set, pending };
}

export function DataTable<T extends RowData>({
  columns,
  data,
  total,
  page,
  pageSize,
  searchPlaceholder = "Search…",
  toolbar,
  emptyText = "Nothing here yet.",
  allowShowDeleted = false,
  getRowId,
}: {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  emptyText?: string;
  allowShowDeleted?: boolean;
  getRowId?: (row: T) => string;
}) {
  const { params, set, pending } = useUrlState();
  const [search, setSearch] = useState(params.get("q") ?? "");

  // Debounced search -> URL
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => set({ q: search || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const table = useTable({
    features: tableFeaturesNone,
    columns,
    data,
    getRowId: getRowId ? (row: T) => getRowId(row) : undefined,
  });

  const sort = params.get("sort");
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        {allowShowDeleted && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
            <Switch checked={params.get("deleted") === "1"} onCheckedChange={(v) => set({ deleted: v ? "1" : null })} />
            Show deleted
          </label>
        )}
      </div>

      <div className={cn("overflow-x-auto rounded-lg border bg-card transition-opacity", pending && "opacity-60")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = (header.column.columnDef as Column<T>).meta;
                  const sortKey = meta?.sortKey;
                  const active = sortKey && sort === sortKey;
                  return (
                    <TableHead key={header.id} className={meta?.className}>
                      {header.isPlaceholder ? null : sortKey ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => set({ sort: sortKey, dir: active && dir === "asc" ? "desc" : "asc" }, false)}
                        >
                          <table.FlexRender header={header} />
                          {active ? (
                            dir === "asc" ? (
                              <ArrowUpIcon className="size-3.5" />
                            ) : (
                              <ArrowDownIcon className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDownIcon className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={(cell.column.columnDef as Column<T>).meta?.className}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
        <span>
          {from}–{to} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => set({ size: v })}>
            <SelectTrigger size="sm" className="w-[90px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => set({ page: String(page - 1) }, false)}
          >
            <ChevronLeftIcon />
          </Button>
          <span>
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => set({ page: String(page + 1) }, false)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A select filter bound to `f_<name>` in the URL. */
export function UrlSelectFilter({
  name,
  placeholder,
  options,
}: {
  name: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const { params, set } = useUrlState();
  return (
    <Select
      value={params.get(`f_${name}`) ?? "__all"}
      onValueChange={(v) => set({ [`f_${name}`]: v === "__all" ? null : v })}
    >
      <SelectTrigger className="w-[180px]" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
