import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listPurchases, vendorOptions } from "@/modules/inventory/inventory.queries";
import { can } from "@/modules/rbac/access";
import { PurchasesTable } from "./purchases-table";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage(props: PageProps<"/admin/purchases">) {
  const user = await requirePagePermission("purchases.view");
  const params = parseListParams(await props.searchParams);
  const [{ rows, total }, vendors] = await Promise.all([
    listPurchases(user, params, await getActiveBranchId(user)),
    vendorOptions(user.organizationId),
  ]);
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Vendor bills. Posting a bill adds the parts to stock."
        actions={
          can(user.access, "purchases.create") && (
            <Button asChild>
              <Link href="/admin/purchases/new">
                <PlusIcon /> New purchase
              </Link>
            </Button>
          )
        }
      />
      <PurchasesTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} vendors={vendors} />
    </>
  );
}
