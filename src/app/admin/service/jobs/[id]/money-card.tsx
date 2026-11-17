"use client";

import Link from "next/link";
import { BanknoteIcon, PrinterIcon, Undo2Icon, WalletIcon } from "lucide-react";
import { SelectField, TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatINR } from "@/lib/format";
import type { JobDetail } from "@/modules/service/jobs.queries";
import { cancelInvoiceAction, recordPaymentAction } from "@/modules/service/jobs.actions";
import { cancelInvoiceSchema, paymentSchema } from "@/modules/service/service.schemas";

type Opt = { value: string; label: string };
type Payment = {
  id: string;
  receiptNo: string;
  kind: string;
  amount: number;
  mode: string;
  reference: string | null;
  at: string;
  by: string;
};

function PaymentDialog({
  jobId,
  kind,
  amount,
  payment,
  trigger,
  title,
}: {
  jobId: string;
  kind: "ADVANCE" | "PAYMENT" | "REFUND";
  amount: number;
  payment: { modes: Opt[]; accounts: Opt[] };
  trigger: React.ReactNode;
  title: string;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title={title}
      schema={paymentSchema}
      defaultValues={{
        jobId,
        kind,
        amount: amount > 0 ? String(amount) : "",
        paymentModeId: payment.modes[0]?.value ?? "",
        moneyAccountId: payment.accounts[0]?.value ?? "",
        reference: "",
      }}
      action={recordPaymentAction}
      submitLabel={kind === "REFUND" ? "Refund" : "Save receipt"}
      successMessage={kind === "REFUND" ? "Refund recorded" : "Payment recorded"}
    >
      {(form) => (
        <>
          <TextField control={form.control} name="amount" label="Amount (₹)" type="number" step="0.01" min={0} />
          <SelectField
            control={form.control}
            name="paymentModeId"
            label={kind === "REFUND" ? "Refunded by" : "Paid by"}
            options={payment.modes}
          />
          <SelectField
            control={form.control}
            name="moneyAccountId"
            label={kind === "REFUND" ? "Paid from" : "Received into"}
            options={payment.accounts}
          />
          <TextField control={form.control} name="reference" label="Reference (UPI ref, card slip…)" />
        </>
      )}
    </FormDialog>
  );
}

export function MoneyCard({
  jobId,
  invoice,
  cancelledInvoices,
  payments,
  netPaid,
  due,
  chargesTotal,
  can,
  payment,
}: {
  jobId: string;
  invoice: { id: string; invoiceNo: string; grandTotal: number; kind: string } | null;
  cancelledInvoices: { id: string; invoiceNo: string; reason: string | null }[];
  payments: Payment[];
  netPaid: number;
  due: number | null;
  chargesTotal: number;
  can: JobDetail["can"];
  payment: { modes: Opt[]; accounts: Opt[] };
}) {
  const refundable = Math.round((netPaid - (invoice ? invoice.grandTotal : 0)) * 100) / 100;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Invoice & payments</CardTitle>
        <div className="flex flex-wrap gap-2">
          {can.advance && (
            <PaymentDialog
              jobId={jobId}
              kind="ADVANCE"
              amount={0}
              payment={payment}
              title="Collect advance"
              trigger={
                <Button size="sm" variant="outline">
                  <WalletIcon /> Advance
                </Button>
              }
            />
          )}
          {can.collect && due !== null && (
            <PaymentDialog
              jobId={jobId}
              kind="PAYMENT"
              amount={due}
              payment={payment}
              title={`Collect payment · ${formatINR(due)} due`}
              trigger={
                <Button size="sm">
                  <BanknoteIcon /> Collect {formatINR(due)}
                </Button>
              }
            />
          )}
          {can.refund && (
            <PaymentDialog
              jobId={jobId}
              kind="REFUND"
              amount={refundable}
              payment={payment}
              title={`Refund · up to ${formatINR(refundable)}`}
              trigger={
                <Button size="sm" variant="outline">
                  <Undo2Icon /> Refund
                </Button>
              }
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {invoice ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div>
              <div className="text-xs text-muted-foreground">
                {invoice.kind === "TAX_INVOICE" ? "Tax invoice" : "Invoice (non-GST)"}
              </div>
              <Link href={`/admin/invoices/${invoice.id}`} className="font-mono font-medium hover:underline">
                {invoice.invoiceNo}
              </Link>
              <span className="ml-2 tabular-nums">{formatINR(invoice.grandTotal)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {due !== null &&
                (due > 0.001 ? (
                  <StatusBadge tone="peach">{formatINR(due)} due</StatusBadge>
                ) : (
                  <StatusBadge tone="mint">Paid</StatusBadge>
                ))}
              <Button asChild size="sm" variant="outline">
                <Link href={`/print/invoice/${invoice.id}`} target="_blank">
                  <PrinterIcon /> Print
                </Link>
              </Button>
              {can.cancelInvoice && (
                <FormDialog
                  trigger={
                    <Button size="sm" variant="ghost" className="text-destructive">
                      Cancel invoice
                    </Button>
                  }
                  title={`Cancel ${invoice.invoiceNo}?`}
                  description="The number stays used. Money received stays on the job and is adjusted on the next invoice."
                  schema={cancelInvoiceSchema}
                  defaultValues={{ invoiceId: invoice.id, reason: "" }}
                  action={cancelInvoiceAction}
                  submitLabel="Cancel invoice"
                  destructive
                  successMessage="Invoice cancelled"
                >
                  {(form) => <TextField control={form.control} name="reason" label="Reason" />}
                </FormDialog>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            No invoice yet. {chargesTotal > 0 ? `Current charges ${formatINR(chargesTotal)}.` : ""} The invoice is
            issued when the job is ready for pickup.
          </p>
        )}
        {cancelledInvoices.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Cancelled: {cancelledInvoices.map((c) => `${c.invoiceNo}${c.reason ? ` (${c.reason})` : ""}`).join(", ")}
          </p>
        )}
        {payments.length > 0 && (
          <ul className="divide-y">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <StatusBadge tone={p.kind === "REFUND" ? "peach" : p.kind === "ADVANCE" ? "sky" : "mint"}>
                    {p.kind.toLowerCase()}
                  </StatusBadge>{" "}
                  <Link href={`/print/receipt/${p.id}`} target="_blank" className="font-mono text-xs hover:underline">
                    {p.receiptNo}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDateTime(p.at)} · {p.mode}
                    {p.reference ? ` (${p.reference})` : ""} · {p.by}
                  </span>
                </span>
                <span className="tabular-nums">
                  {p.kind === "REFUND" ? "−" : ""}
                  {formatINR(p.amount)}
                </span>
              </li>
            ))}
            <li className="flex justify-between py-2 font-medium">
              <span>Net received</span>
              <span className="tabular-nums">{formatINR(netPaid)}</span>
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
