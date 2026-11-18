"use client";

import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { DataTable, UrlSelectFilter, type Column } from "@/components/data-table/data-table";
import { StatusBadge, toTone } from "@/components/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { whatsappLink } from "@/modules/leads/lead-logic";
import { LEAD_TYPE_LABELS } from "@/modules/leads/leads.schemas";
import type { LeadRow } from "@/modules/leads/leads.queries";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export function LeadsTable({
  rows,
  total,
  page,
  pageSize,
  statuses,
  sources,
  assignees,
  showStateFilter = true,
  canSeeDeleted,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  statuses: Option[];
  sources: Option[];
  assignees: Option[];
  showStateFilter?: boolean;
  canSeeDeleted?: boolean;
}) {
  const columns: Column<LeadRow>[] = [
    {
      id: "name",
      header: "Name",
      meta: { sortKey: "name" },
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div className="min-w-40">
            <Link href={`/admin/leads/${l.id}`} className="font-medium hover:underline">
              {l.name}
            </Link>
            {l.enquiryCount > 1 && (
              <span
                className="ml-1.5 rounded bg-peach px-1 text-[10px] font-medium text-peach-foreground"
                title="Enquiries from this number"
              >
                ×{l.enquiryCount}
              </span>
            )}
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <a href={`tel:+91${l.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <PhoneIcon className="size-3" /> {l.phone}
              </a>
              <a
                href={whatsappLink(l.phone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="hover:text-foreground"
              >
                <MessageCircleIcon className="size-3.5" />
              </a>
            </div>
          </div>
        );
      },
    },
    {
      id: "interest",
      header: "Interested in",
      meta: { className: "hidden md:table-cell max-w-64" },
      cell: ({ row }) => (
        <div className="truncate">
          <span className="text-xs text-muted-foreground">{LEAD_TYPE_LABELS[row.original.type]} · </span>
          {row.original.interest || "—"}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge tone={toTone(row.original.statusTone)}>{row.original.status}</StatusBadge>,
    },
    {
      id: "followUp",
      header: "Follow-up",
      meta: { sortKey: "followUp" },
      cell: ({ row }) =>
        row.original.nextFollowUpAt ? (
          <span
            className={cn(
              "text-sm whitespace-nowrap",
              row.original.overdue && "font-medium text-destructive",
              row.original.dueToday && "font-medium text-warning",
            )}
          >
            {row.original.dueToday
              ? formatDateTime(row.original.nextFollowUpAt)
              : formatDate(row.original.nextFollowUpAt)}
            {row.original.overdue && <span className="block text-xs">overdue</span>}
            {row.original.dueToday && <span className="block text-xs">today</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "assignee",
      header: "Counsellor",
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => row.original.assignee ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      id: "source",
      header: "Source",
      meta: { className: "hidden xl:table-cell" },
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.source} <span className="text-muted-foreground">· {row.original.branchCode}</span>
        </span>
      ),
    },
    {
      id: "created",
      header: "Received",
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span>
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
      searchPlaceholder="Name, phone or email…"
      emptyText="No enquiries found."
      allowShowDeleted={canSeeDeleted}
      toolbar={
        <>
          {showStateFilter && (
            <UrlSelectFilter
              name="state"
              placeholder="Open"
              options={[
                { value: "won", label: "Won" },
                { value: "lost", label: "Lost" },
                { value: "all", label: "All" },
              ]}
            />
          )}
          <UrlSelectFilter
            name="type"
            placeholder="Course & repair"
            options={[
              { value: "COURSE", label: "Course" },
              { value: "SERVICE", label: "Repair" },
            ]}
          />
          <UrlSelectFilter name="status" placeholder="Any status" options={statuses} />
          <UrlSelectFilter
            name="assignee"
            placeholder="Anyone"
            options={[{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...assignees]}
          />
          <UrlSelectFilter name="source" placeholder="Any source" options={sources} />
          <UrlSelectFilter
            name="follow"
            placeholder="Any follow-up"
            options={[
              { value: "due", label: "Due (today + overdue)" },
              { value: "today", label: "Today" },
              { value: "overdue", label: "Overdue" },
            ]}
          />
        </>
      }
    />
  );
}
