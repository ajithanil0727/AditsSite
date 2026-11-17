import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listMovements } from "@/modules/inventory/inventory.queries";
import { MovementsTable } from "./movements-table";

export const metadata: Metadata = { title: "Stock movements" };

export default async function MovementsPage(props: PageProps<"/admin/inventory/movements">) {
  const user = await requirePagePermission("inventory.view");
  const params = parseListParams(await props.searchParams, { defaultPageSize: 50 });
  const { rows, total } = await listMovements(user, params, await getActiveBranchId(user));
  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Every stock in and out. The ledger is never edited; corrections are new adjustments."
      />
      <MovementsTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} />
    </>
  );
}
