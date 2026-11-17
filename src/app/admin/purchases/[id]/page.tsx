import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { PageHeader } from "@/components/layout/page-header";
import { DocStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { cancelPurchaseAction, postPurchaseAction } from "@/modules/inventory/inventory.actions";
import {
  getPurchase,
  partPickerOptions,
  paymentFormOptions,
  vendorOptions,
} from "@/modules/inventory/inventory.queries";
import { canAccessBranch } from "@/modules/rbac/access";
import { PurchaseForm } from "../purchase-form";
import { VendorPaymentDialog } from "./vendor-payment-dialog";

export const metadata: Metadata = { title: "Purchase" };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function PurchasePage(props: PageProps<"/admin/purchases/[id]">) {
  const user = await requirePagePermission("purchases.view");
  const { id } = await props.params;
  const p = await getPurchase(user, id);
  if (!p) notFound();
  const editable = p.status === "DRAFT" && canAccessBranch(user.access, "purchases.create", p.branchId);
  const due = Math.round((Number(p.total) - Number(p.amountPaid)) * 100) / 100;

  if (editable) {
    const [branches, vendors, parts] = await Promise.all([
      getSelectableBranches(user),
      vendorOptions(user.organizationId),
      partPickerOptions(user.organizationId, null),
    ]);
    return (
      <>
        <PageHeader
          title={`Purchase ${p.purchaseNo}`}
          description="Draft: edit the lines, then post to add the parts to stock."
          actions={
            <>
              <DocStatus status={p.status} />
              {canAccessBranch(user.access, "purchases.cancel", p.branchId) && (
                <ConfirmAction
                  title="Cancel this draft?"
                  description="It stays in the list as cancelled."
                  confirmLabel="Cancel purchase"
                  destructive
                  action={cancelPurchaseAction.bind(null, { id: p.id })}
                  trigger={<Button variant="outline">Cancel draft</Button>}
                />
              )}
              {canAccessBranch(user.access, "purchases.post", p.branchId) && (
                <ConfirmAction
                  title="Post this purchase?"
                  description="The parts are added to stock now. Posted bills can't be edited."
                  confirmLabel="Post"
                  successMessage="Purchase posted"
                  action={postPurchaseAction.bind(null, { id: p.id })}
                  trigger={<Button>Post to stock</Button>}
                />
              )}
            </>
          }
        />
        <PurchaseForm
          initial={{
            id: p.id,
            branchId: p.branchId,
            vendorId: p.vendorId,
            billNo: p.billNo,
            billDate: ymd(p.billDate),
            notes: p.notes ?? "",
            items: p.items.map((i) => ({
              partId: i.partId,
              qty: i.qty.toString(),
              unitCost: i.unitCost.toString(),
              taxRate: i.taxRate.toString(),
            })),
          }}
          branches={branches
            .filter((b) => canAccessBranch(user.access, "purchases.create", b.id))
            .map((b) => ({ value: b.id, label: b.name }))}
          vendors={vendors}
          parts={parts}
          unregisteredBranchIds={p.branch.gstRegistrationId ? [] : [p.branchId]}
        />
      </>
    );
  }

  const canPay = p.status === "POSTED" && due > 0 && canAccessBranch(user.access, "vendors.pay", p.branchId);
  const payOptions = canPay ? await paymentFormOptions(user.organizationId, [p.branchId]) : null;

  return (
    <>
      <PageHeader
        title={`Purchase ${p.purchaseNo}`}
        description={`${p.vendor.name} · bill ${p.billNo} dated ${formatDate(p.billDate)} · ${p.branch.name}`}
        actions={
          <>
            <DocStatus status={p.status} />
            {canPay && payOptions && (
              <VendorPaymentDialog
                purchaseId={p.id}
                due={due}
                options={payOptions}
                today={ymd(istDateOnly(new Date()))}
              />
            )}
          </>
        }
      />
      <div className="grid max-w-5xl gap-6">
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost/unit</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        {i.part.name} <span className="text-xs text-muted-foreground">{i.part.sku}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(i.qty)} {i.part.unit.symbol}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(Number(i.unitCost))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(i.taxRate)}% · {formatINR(Number(i.taxAmount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatINR(Number(i.total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Before GST</dt>
              <dd className="text-right tabular-nums">{formatINR(Number(p.subtotal))}</dd>
              <dt className="text-muted-foreground">GST</dt>
              <dd className="text-right tabular-nums">{formatINR(Number(p.taxTotal))}</dd>
              <dt className="font-medium">Total</dt>
              <dd className="text-right font-medium tabular-nums">{formatINR(Number(p.total))}</dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-right tabular-nums">{formatINR(Number(p.amountPaid))}</dd>
              <dt className="font-medium">Due</dt>
              <dd className="text-right font-medium tabular-nums">{formatINR(due)}</dd>
            </dl>
          </CardContent>
        </Card>
        {p.payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {p.payments.map((pay) => (
                  <li key={pay.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {formatDate(pay.paidAt)} · {pay.paymentMode.name}
                      {pay.reference ? ` (${pay.reference})` : ""} · {pay.paidBy.name}
                    </span>
                    <span className="tabular-nums">{formatINR(Number(pay.amount))}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
