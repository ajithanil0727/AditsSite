import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { loadInvoiceDocument } from "@/modules/invoices/invoices.queries";
import { validInvoiceToken } from "@/modules/service/tracker-links";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

async function Doc(props: PageProps<"/track/invoice/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const t = typeof sp.t === "string" ? sp.t : null;
  if (!validInvoiceToken(id, t)) notFound();
  const inv = await loadInvoiceDocument(id);
  if (!inv || inv.status !== "ISSUED") notFound();
  const company = await getCompanyProfile(inv.organizationId);
  return <InvoiceDocument inv={inv} logoUrl={company.logoUrl} />;
}

/** Customer's invoice from the repair tracker (signed link). Print / save as PDF from the browser. */
export default function TrackInvoicePage(props: PageProps<"/track/invoice/[id]">) {
  return (
    <section className="py-8">
      <div className="mx-auto max-w-[210mm] bg-card shadow-sm print:shadow-none">
        <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading…</p>}>
          <Doc {...props} />
        </Suspense>
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground print:hidden">Use your browser&apos;s Print to save it as a PDF.</p>
    </section>
  );
}
