"use client";

import { HandIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge, toTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { takeJobAction } from "@/modules/service/jobs.actions";
import type { ShelfRow } from "@/modules/service/jobs.queries";
import { PRIORITY_LABELS } from "@/modules/service/service.schemas";

const PRIORITY_TONE = { URGENT: "danger", HIGH: "peach", NORMAL: "sky", LOW: "neutral" } as const;

function TakeButton({ row }: { row: ShelfRow }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      aria-label={`Take job ${row.jobNo}`}
      onClick={() =>
        start(async () => {
          const res = await takeJobAction({ id: row.id });
          if (res.ok) toast.success(`Job ${row.jobNo} is yours. It's in My jobs.`);
          else toast.error(res.error);
        })
      }
    >
      <HandIcon /> {pending ? "Taking…" : "Take this job"}
    </Button>
  );
}

export function ShelfTable({ rows, canTake }: { rows: ShelfRow[]; canTake: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Device and problem</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Promised</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                The shelf is empty: every open job has an engineer.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">
                <div className="font-mono text-xs font-medium">{r.jobNo}</div>
                <div className="text-xs text-muted-foreground">
                  {r.branchCode}
                  {r.isWarrantyJob ? " · warranty" : ""}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{r.device}</div>
                <div className="text-sm text-muted-foreground">{r.problem}</div>
              </TableCell>
              <TableCell>
                <StatusBadge tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABELS[r.priority]}</StatusBadge>
                <div className="mt-1">
                  <StatusBadge tone={toTone(r.tone)}>{r.status}</StatusBadge>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(r.receivedAt)}</TableCell>
              <TableCell className="whitespace-nowrap">{r.estimatedAt ? formatDate(r.estimatedAt) : "—"}</TableCell>
              <TableCell className="text-right">{canTake && <TakeButton row={r} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
