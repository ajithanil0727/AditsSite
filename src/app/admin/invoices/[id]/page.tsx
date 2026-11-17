import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requirePagePermission } from "@/modules/auth/current";
import { getInvoice } from "@/modules/invoices/invoices.queries";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage(props: PageProps<"/admin/invoices/[id]">) {
  const user = await requirePagePermission("invoices.view");
  const { id } = await props.params;
  const inv = await getInvoice(user, id);
  if (!inv) notFound();
  const company = await getCompanyProfile(user.organizationId);
  return (
    <>
      <PageHeader
        title={`Invoice ${inv.invoiceNo}`}
        actions={
          <>
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
      <div className="overflow-x-auto rounded-xl border">
        <InvoiceDocument inv={inv} logoUrl={company.logoUrl} />
      </div>
    </>
  );
}
