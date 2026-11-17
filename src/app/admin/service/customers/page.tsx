import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { parseListParams } from "@/lib/list-params";
import { requirePagePermission } from "@/modules/auth/current";
import { listCustomers } from "@/modules/service/jobs.queries";
import { CustomersTable } from "./customers-table";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage(props: PageProps<"/admin/service/customers">) {
  const user = await requirePagePermission("jobcards.view");
  const params = parseListParams(await props.searchParams);
  const { rows, total } = await listCustomers(user, params);
  return (
    <>
      <PageHeader
        title="Customers"
        description="Service customers and their devices. Search by name, phone, IMEI or serial."
      />
      <CustomersTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} />
    </>
  );
}
