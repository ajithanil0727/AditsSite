import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { listRuns } from "@/modules/accounts/accounts.queries";
import { can } from "@/modules/rbac/access";
import { periodPresets } from "../period";
import { NewRunDialog } from "./run-controls";

export const metadata: Metadata = { title: "Profit distribution" };

export default async function DistributionPage() {
  const user = await requirePagePermission("profit.view");
  const runs = await listRuns(user.organizationId);
  return (
    <>
      <PageHeader
        title="Profit distribution"
        description="Each branch's profit for a period, split by the partner shares in force (shares can change mid-period). Branches without shares keep their profit undistributed."
        actions={can(user.access, "profit.run") && <NewRunDialog defaults={periodPresets().lastMonth} />}
      />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Net profit</TableHead>
              <TableHead className="text-right">Not distributed</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No distributions worked out yet.
                </TableCell>
              </TableRow>
            )}
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/admin/accounts/profit-distribution/${r.id}`} className="font-medium hover:underline">
                    {formatDate(r.periodFrom)} – {formatDate(r.periodTo)}
                  </Link>
                  {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(r.net)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.undistributed ? formatINR(r.undistributed) : "—"}
                </TableCell>
                <TableCell>
                  {r.status === "LOCKED" ? (
                    <StatusBadge tone="mint">Locked{r.lockedBy ? ` by ${r.lockedBy}` : ""}</StatusBadge>
                  ) : (
                    <StatusBadge tone="peach">Draft</StatusBadge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
