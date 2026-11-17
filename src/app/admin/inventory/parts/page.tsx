import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { requirePagePermission } from "@/modules/auth/current";
import { listParts, partFormOptions } from "@/modules/inventory/inventory.queries";
import { can } from "@/modules/rbac/access";
import { PartFormDialog } from "./part-form-dialog";
import { PartsTable } from "./parts-table";

export const metadata: Metadata = { title: "Parts" };

export default async function PartsPage(props: PageProps<"/admin/inventory/parts">) {
  const user = await requirePagePermission("inventory.view");
  const params = parseListParams(await props.searchParams, { sortable: ["name", "sku"] });
  const [{ rows, total }, options] = await Promise.all([listParts(user, params), partFormOptions(user.organizationId)]);
  const canManage = can(user.access, "parts.manage");
  return (
    <>
      <PageHeader
        title="Parts"
        description="Spare parts, ICs, consumables, tools and lab equipment. Sale prices include GST."
        actions={
          canManage && (
            <PartFormDialog
              options={options}
              trigger={
                <Button>
                  <PlusIcon /> New part
                </Button>
              }
            />
          )
        }
      />
      <PartsTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        options={options}
        canManage={canManage}
      />
    </>
  );
}
