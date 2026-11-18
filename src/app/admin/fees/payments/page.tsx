import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { formatINR } from "@/lib/format";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { listFeePayments } from "@/modules/students/students.queries";
import { PaymentsTable } from "./payments-table";

export const metadata: Metadata = { title: "Fee receipts" };

export default async function FeePaymentsPage(props: PageProps<"/admin/fees/payments">) {
  const user = await requirePagePermission("fees.view");
  const params = parseListParams(await props.searchParams, { defaultPageSize: 50 });
  const { rows, total, sum } = await listFeePayments(user, params, await getActiveBranchId(user));
  return (
    <>
      <PageHeader title="Fee receipts" description={`Total received in this list: ${formatINR(sum)}.`} />
      <PaymentsTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        canCancel={can(user.access, "fees.cancel_receipt")}
      />
    </>
  );
}
