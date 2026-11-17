import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { formatINR } from "@/lib/format";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listInvoices } from "@/modules/invoices/invoices.queries";
import { InvoicesTable } from "./invoices-table";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage(props: PageProps<"/admin/invoices">) {
  const user = await requirePagePermission("invoices.view");
  const params = parseListParams(await props.searchParams);
  const { rows, total, dueTotal } = await listInvoices(user, params, await getActiveBranchId(user));
  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          dueTotal !== null
            ? `Dues list: ${formatINR(dueTotal)} outstanding.`
            : "Service invoices. Pick 'Dues' to see unpaid balances."
        }
      />
      <InvoicesTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} />
    </>
  );
}
