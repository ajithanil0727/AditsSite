import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { requirePagePermission } from "@/modules/auth/current";
import { listPartners } from "@/modules/accounts/accounts.queries";
import { can } from "@/modules/rbac/access";
import { PartnerDialog, SetSharesDialog } from "./partner-dialogs";

export const metadata: Metadata = { title: "Partners" };

export default async function PartnersPage() {
  const user = await requirePagePermission("partners.view");
  const [{ partners, branches, branchTotals }, users] = await Promise.all([
    listPartners(user.organizationId),
    db.user.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const manage = can(user.access, "partners.manage");
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const active = partners.filter((p) => p.isActive);
  return (
    <>
      <PageHeader
        title="Partners"
        description="Who shares the profit of each branch, and their capital and drawings. Shares are optional: a branch without shares keeps its profit undistributed."
        actions={
          manage && (
            <PartnerDialog
              users={users.map((u) => ({ value: u.id, label: u.name }))}
              trigger={
                <Button>
                  <PlusIcon /> New partner
                </Button>
              }
            />
          )
        }
      />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              {branches.map((b) => (
                <TableHead key={b.id} className="text-right">
                  {b.name}
                </TableHead>
              ))}
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="text-right">Drawings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.length === 0 && (
              <TableRow>
                <TableCell colSpan={branches.length + 3} className="py-10 text-center text-muted-foreground">
                  No partners yet.
                </TableCell>
              </TableRow>
            )}
            {partners.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/accounts/partners/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {!p.isActive && (
                    <StatusBadge tone="neutral" className="ml-2">
                      Inactive
                    </StatusBadge>
                  )}
                  {p.login && <div className="text-xs text-muted-foreground">{p.login}</div>}
                </TableCell>
                {branches.map((b) => (
                  <TableCell key={b.id} className="text-right tabular-nums">
                    {p.shares[b.id] ? `${p.shares[b.id]}%` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{formatINR(p.capital)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(p.drawings)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Shares now</TableCell>
              {branches.map((b) => (
                <TableCell key={b.id} className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    {branchTotals[b.id] === 100 ? (
                      <StatusBadge tone="mint">100%</StatusBadge>
                    ) : branchTotals[b.id] === 0 ? (
                      <StatusBadge tone="neutral">Not set</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">{branchTotals[b.id]}%</StatusBadge>
                    )}
                    {manage && active.length > 0 && (
                      <SetSharesDialog
                        branch={{ value: b.id, label: b.name }}
                        partners={active.map((p) => ({ value: p.id, label: p.name }))}
                        current={Object.fromEntries(active.map((p) => [p.id, p.shares[b.id] ?? 0]))}
                        today={today}
                        trigger={
                          <Button size="xs" variant="outline">
                            Set shares
                          </Button>
                        }
                      />
                    )}
                  </div>
                </TableCell>
              ))}
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}
