import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/current";
import { getRun } from "@/modules/accounts/accounts.queries";
import { can } from "@/modules/rbac/access";
import { RunActions } from "../run-controls";

export const metadata: Metadata = { title: "Profit distribution" };

export default async function RunPage(props: PageProps<"/admin/accounts/profit-distribution/[id]">) {
  const user = await requirePagePermission("profit.view");
  const { id } = await props.params;
  const run = await getRun(user.organizationId, id);
  if (!run) notFound();
  const draft = run.status === "DRAFT";
  return (
    <>
      <PageHeader
        title={`Profit ${formatDate(run.periodFrom)} – ${formatDate(run.periodTo)}`}
        description={
          run.note ??
          (draft
            ? "Draft: figures are worked out from today's data. Lock it when final."
            : `Locked${run.lockedBy ? ` by ${run.lockedBy}` : ""}${run.lockedAt ? ` on ${formatDateTime(run.lockedAt)}` : ""}.`)
        }
        actions={
          draft && (
            <RunActions
              id={run.id}
              canLock={can(user.access, "profit.lock")}
              canDelete={can(user.access, "profit.run")}
            />
          )
        }
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>By branch</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Branch</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Costs</TableHead>
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">Shared out</TableHead>
                  <TableHead className="pr-6 text-right">Not distributed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.summary.map((s) => (
                  <TableRow key={s.branchId}>
                    <TableCell className="pl-6 font-medium">{s.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(s.income)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(s.costs)}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular-nums", s.net < 0 && "text-destructive")}>
                      {formatINR(s.net)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(s.distributed)}</TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {s.undistributed ? (
                        <span title="No partner shares for (part of) this period">{formatINR(s.undistributed)}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By partner</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Partner</TableHead>
                  <TableHead className="text-right">Share of profit</TableHead>
                  <TableHead className="text-right">Drawings in the period</TableHead>
                  <TableHead className="pr-6 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.partners.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No partner shares cover this period, so nothing is distributed.
                    </TableCell>
                  </TableRow>
                )}
                {run.partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6 font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(p.share)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(p.drawings)}</TableCell>
                    <TableCell
                      className={cn("pr-6 text-right font-medium tabular-nums", p.balance < 0 && "text-destructive")}
                    >
                      {formatINR(p.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {run.lines.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Working</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Branch</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Net profit</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="pr-6 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="pl-6">{l.branchCode}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {l.segmentFrom ? `${formatDate(l.segmentFrom)} – ${formatDate(l.segmentTo)}` : "Whole period"}
                      </TableCell>
                      <TableCell>{l.partner}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(l.net)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.percent}%</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{formatINR(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {draft && (
          <StatusBadge tone="peach" className="w-fit">
            Draft: partner balances only count locked runs.
          </StatusBadge>
        )}
      </div>
    </>
  );
}
