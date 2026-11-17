import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { requirePagePermission } from "@/modules/auth/current";
import { getInvoice } from "@/modules/invoices/invoices.queries";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Invoice" };

export default async function PrintInvoicePage(props: PageProps<"/print/invoice/[id]">) {
  const user = await requirePagePermission("invoices.view");
  const { id } = await props.params;
  const inv = await getInvoice(user, id);
  if (!inv) notFound();
  const company = await getCompanyProfile(user.organizationId);
  return (
    <div className="shadow-sm print:shadow-none">
      <InvoiceDocument inv={inv} logoUrl={company.logoUrl} />
    </div>
  );
}
