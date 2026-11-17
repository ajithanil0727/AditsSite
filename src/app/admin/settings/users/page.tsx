import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { USER_SORTS, listUsers, userFormOptions } from "@/modules/users/users.queries";
import { UserFormDialog } from "./user-form-dialog";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage(props: PageProps<"/admin/settings/users">) {
  const user = await requirePagePermission("users.view");
  const params = parseListParams(await props.searchParams, { sortable: USER_SORTS });
  const activeBranchId = await getActiveBranchId(user);
  const [{ rows, total }, options] = await Promise.all([
    listUsers(user, params, activeBranchId),
    userFormOptions(user),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff who can sign in. Filtered by the branch picked in the top bar."
        actions={
          can(user.access, "users.create") && (
            <UserFormDialog
              options={options}
              trigger={
                <Button>
                  <PlusIcon /> New user
                </Button>
              }
            />
          )
        }
      />
      <UsersTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        options={options}
        perms={{
          update: can(user.access, "users.update"),
          delete: can(user.access, "users.delete"),
          resetPassword: can(user.access, "users.reset_password"),
        }}
      />
    </>
  );
}
