import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { formatINR } from "@/lib/format";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { listStock, partFormOptions, partPickerOptions } from "@/modules/inventory/inventory.queries";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { StockTable } from "./stock-table";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage(props: PageProps<"/admin/inventory/stock">) {
  const user = await requirePagePermission("inventory.view");
  const params = parseListParams(await props.searchParams);
  const [activeBranchId, branches] = await Promise.all([getActiveBranchId(user), getSelectableBranches(user)]);
  const adjustBranches = branches.filter((b) => canAccessBranch(user.access, "inventory.adjust", b.id));
  const [{ rows, total, totalValue }, opts, parts] = await Promise.all([
    listStock(user, params, activeBranchId),
    partFormOptions(user.organizationId),
    partPickerOptions(user.organizationId, activeBranchId),
  ]);

  return (
    <>
      <PageHeader
        title="Stock"
        description={`Parts on hand per branch at weighted average cost. Value of this list: ${formatINR(totalValue)}.`}
        actions={
          can(user.access, "inventory.adjust") &&
          adjustBranches.length > 0 && (
            <AdjustStockDialog
              branches={adjustBranches}
              defaultBranchId={activeBranchId ?? adjustBranches[0].id}
              parts={parts}
            />
          )
        }
      />
      <StockTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        categories={opts.categories}
      />
    </>
  );
}
