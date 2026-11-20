import type { Metadata } from "next";
import { PencilIcon, PlusIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { requirePagePermission } from "@/modules/auth/current";
import { getPartner, moneyFormOptions } from "@/modules/accounts/accounts.queries";
import { PARTNER_TXN_LABELS } from "@/modules/accounts/accounts.schemas";
import { can } from "@/modules/rbac/access";
import { PartnerDialog, PartnerTxnDialog } from "../partner-dialogs";

export const metadata: Metadata = { title: "Partner" };

export default async function PartnerPage(props: PageProps<"/admin/accounts/partners/[id]">) {
  const user = await requirePagePermission("partners.view");
  const { id } = await props.params;
  const p = await getPartner(user.organizationId, id);
  if (!p) notFound();
  const manage = can(user.access, "partners.manage");
  const [options, users] = await Promise.all([
    moneyFormOptions(user, "partners.manage"),
    db.user.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title={p.name}
        description={
          [p.phone, p.email, p.pan ? `PAN ${p.pan}` : null, p.login ? `login ${p.login}` : null]
            .filter(Boolean)
            .join(" · ") || "Partner"
        }
        actions={
          manage && (
            <>
              <PartnerTxnDialog
                partnerId={p.id}
                branches={options.branches}
                accounts={options.accounts}
                today={today}
                trigger={
                  <Button>
                    <PlusIcon /> Capital / drawing
                  </Button>
                }
              />
              <PartnerDialog
                users={users.map((u) => ({ value: u.id, label: u.name }))}
                initial={{
                  id: p.id,
                  name: p.name,
                  phone: p.phone ?? "",
                  email: p.email ?? "",
                  pan: p.pan ?? "",
                  userId: p.userId,
                  isActive: p.isActive,
                }}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
              />
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Capital (net)", p.totals.capital],
          ["Profit share (locked runs)", p.totals.profitShare],
          ["Drawings", p.totals.drawings],
          ["Balance (share − drawings)", p.totals.balance],
        ].map(([label, v]) => (
          <Card key={label as string} className="py-4">
            <CardContent>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-xl font-semibold tabular-nums ${(v as number) < 0 ? "text-destructive" : ""}`}>
                {formatINR(v as number)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shares</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Branch</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="pr-6">Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.shares.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      No shares set (that&apos;s fine: shares are optional).
                    </TableCell>
                  </TableRow>
                )}
                {p.shares.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-6">{s.branch}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.percent}%</TableCell>
                    <TableCell className="pr-6 text-sm">
                      {formatDate(s.from)} – {s.to ? formatDate(s.to) : "now"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Capital and drawings</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      Nothing recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {p.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-6 whitespace-nowrap">{formatDate(t.date)}</TableCell>
                    <TableCell>
                      {PARTNER_TXN_LABELS[t.type]}
                      <div className="text-xs text-muted-foreground">
                        {t.branchCode}
                        {t.account ? ` · ${t.account}` : ""}
                        {t.note ? ` · ${t.note}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">{formatINR(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
