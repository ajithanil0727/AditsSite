import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listTransfers } from "@/modules/inventory/inventory.queries";
import { can } from "@/modules/rbac/access";
import { TransfersTable } from "./transfers-table";

export const metadata: Metadata = { title: "Stock transfers" };

export default async function TransfersPage(props: PageProps<"/admin/inventory/transfers">) {
  const user = await requirePagePermission("inventory.view");
  const params = parseListParams(await props.searchParams);
  const { rows, total } = await listTransfers(user, params, await getActiveBranchId(user));
  return (
    <>
      <PageHeader
        title="Stock transfers"
        description="Move parts between branches. Stock leaves on dispatch and arrives when the other branch receives it."
        actions={
          can(user.access, "inventory.transfer") && (
            <Button asChild>
              <Link href="/admin/inventory/transfers/new">
                <PlusIcon /> New transfer
              </Link>
            </Button>
          )
        }
      />
      <TransfersTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} />
    </>
  );
}
