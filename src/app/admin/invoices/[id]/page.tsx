import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDate, formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { creditable } from "@/modules/invoices/credit-notes.service";
import { getInvoice } from "@/modules/invoices/invoices.queries";
import { canAccessBranch } from "@/modules/rbac/access";
import { CreditNoteDialog } from "./credit-note-dialog";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage(props: PageProps<"/admin/invoices/[id]">) {
  const user = await requirePagePermission("invoices.view");
  const { id } = await props.params;
  const inv = await getInvoice(user, id);
  if (!inv) notFound();
  const company = await getCompanyProfile(user.organizationId);
  // Credit notes: issued repair invoices whose device has been delivered.
  const job = inv.jobCard
    ? await db.jobCard.findUnique({
        where: { id: inv.jobCard.id },
        select: { status: { select: { systemKey: true } } },
      })
    : null;
  const canCredit =
    inv.kind !== "CREDIT_NOTE" &&
    inv.status === "ISSUED" &&
    job?.status.systemKey === "DELIVERED" &&
    canAccessBranch(user.access, "invoices.credit_note", inv.branchId);
  const max = canCredit ? await creditable(inv.id) : 0;
  const [modes, accounts] =
    canCredit && max > 0
      ? await Promise.all([
          db.paymentMode.findMany({
            where: { organizationId: user.organizationId, isActive: true },
            orderBy: { sortOrder: "asc" },
          }),
          db.moneyAccount.findMany({ where: { branchId: inv.branchId, isActive: true }, orderBy: { name: "asc" } }),
        ])
      : [[], []];
  return (
    <>
      <PageHeader
        title={`${inv.kind === "CREDIT_NOTE" ? "Credit note" : "Invoice"} ${inv.invoiceNo}`}
        actions={
          <>
            {canCredit && max > 0 && (
              <CreditNoteDialog
                invoiceId={inv.id}
                max={max}
                modes={modes.map((m) => ({ value: m.id, label: m.name }))}
                accounts={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            )}
            {inv.originalInvoice && (
              <Button asChild variant="outline">
                <Link href={`/admin/invoices/${inv.originalInvoice.id}`}>Original invoice</Link>
              </Button>
            )}
            {inv.jobCard && (
              <Button asChild variant="outline">
                <Link href={`/admin/service/jobs/${inv.jobCard.id}`}>Open job card</Link>
              </Button>
            )}
            <Button asChild>
              <Link href={`/print/invoice/${inv.id}`} target="_blank">
                <PrinterIcon /> Print / PDF
              </Link>
            </Button>
          </>
        }
      />
      {inv.creditNotes.length > 0 && (
        <div className="mb-4 rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
          Credit notes against this invoice:{" "}
          {inv.creditNotes.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/admin/invoices/${c.id}`} className="font-medium underline">
                {c.invoiceNo}
              </Link>{" "}
              ({formatINR(Number(c.grandTotal))}, {formatDate(c.invoiceDate)})
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <InvoiceDocument inv={inv} logoUrl={company.logoUrl} />
      </div>
    </>
  );
}
