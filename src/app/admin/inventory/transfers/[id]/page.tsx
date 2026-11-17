import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { PageHeader } from "@/components/layout/page-header";
import { DocStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import {
  cancelTransferAction,
  dispatchTransferAction,
  receiveTransferAction,
} from "@/modules/inventory/inventory.actions";
import { getTransfer } from "@/modules/inventory/inventory.queries";
import { canAccessBranch } from "@/modules/rbac/access";

export const metadata: Metadata = { title: "Stock transfer" };

export default async function TransferPage(props: PageProps<"/admin/inventory/transfers/[id]">) {
  const user = await requirePagePermission("inventory.view");
  const { id } = await props.params;
  const t = await getTransfer(user, id);
  if (!t) notFound();
  const canSend = t.status === "DRAFT" && canAccessBranch(user.access, "inventory.transfer", t.fromBranchId);
  const canReceive =
    t.status === "DISPATCHED" && canAccessBranch(user.access, "inventory.receive_transfer", t.toBranchId);

  return (
    <>
      <PageHeader
        title={`Transfer ${t.transferNo}`}
        description={`${t.fromBranch.name} → ${t.toBranch.name}${t.note ? ` · ${t.note}` : ""}`}
        actions={
          <>
            <DocStatus status={t.status} />
            {canSend && (
              <>
                <ConfirmAction
                  title="Cancel this transfer?"
                  description="Nothing has left the branch yet."
                  confirmLabel="Cancel transfer"
                  destructive
                  action={cancelTransferAction.bind(null, { id: t.id })}
                  trigger={<Button variant="outline">Cancel</Button>}
                />
                <ConfirmAction
                  title="Dispatch now?"
                  description={`Stock leaves ${t.fromBranch.name} now at its average cost.`}
                  confirmLabel="Dispatch"
                  successMessage="Dispatched"
                  action={dispatchTransferAction.bind(null, { id: t.id })}
                  trigger={<Button>Dispatch</Button>}
                />
              </>
            )}
            {canReceive && (
              <ConfirmAction
                title="Receive this transfer?"
                description={`Confirm all parts arrived at ${t.toBranch.name}.`}
                confirmLabel="Receive"
                successMessage="Received"
                action={receiveTransferAction.bind(null, { id: t.id })}
                trigger={<Button>Receive</Button>}
              />
            )}
          </>
        }
      />
      <Card className="max-w-4xl">
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      {i.part.name} <span className="text-xs text-muted-foreground">{i.part.sku}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(i.qty)} {i.part.unit.symbol}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.status === "DRAFT" ? "on dispatch" : formatINR(Number(i.unitCost))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {t.dispatchedAt && (
              <div>
                <dt className="text-muted-foreground">Dispatched</dt>
                <dd>
                  {formatDateTime(t.dispatchedAt)} by {t.dispatchedBy?.name}
                </dd>
              </div>
            )}
            {t.receivedAt && (
              <div>
                <dt className="text-muted-foreground">Received</dt>
                <dd>
                  {formatDateTime(t.receivedAt)} by {t.receivedBy?.name}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
