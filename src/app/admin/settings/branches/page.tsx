import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { requirePagePermission } from "@/modules/auth/current";
import { BRANCH_SORTS, gstRegistrationOptions, listBranches } from "@/modules/branches/branches.queries";
import { can } from "@/modules/rbac/access";
import { BranchFormDialog } from "./branch-form-dialog";
import { BranchesTable } from "./branches-table";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage(props: PageProps<"/admin/settings/branches">) {
  const user = await requirePagePermission("branches.view");
  const params = parseListParams(await props.searchParams, { sortable: BRANCH_SORTS });
  const [{ rows, total }, gstOptions] = await Promise.all([
    listBranches(user, params),
    gstRegistrationOptions(user.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Branches"
        description="Institutes, service centres and the head office (cost centre for shared expenses)."
        actions={
          can(user.access, "branches.create") && (
            <BranchFormDialog
              gstOptions={gstOptions}
              trigger={
                <Button>
                  <PlusIcon /> New branch
                </Button>
              }
            />
          )
        }
      />
      <BranchesTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        gstOptions={gstOptions}
        canEdit={can(user.access, "branches.update")}
        canDelete={can(user.access, "branches.delete")}
      />
    </>
  );
}
