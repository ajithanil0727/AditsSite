import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/modules/auth/current";
import { canManageProtected } from "@/modules/rbac/escalation";
import { can } from "@/modules/rbac/access";
import { getRole } from "@/modules/roles/roles.service";
import { PermissionMatrix } from "./permission-matrix";

export const metadata: Metadata = { title: "Edit role" };

export default async function RolePage(props: PageProps<"/admin/settings/roles/[id]">) {
  const user = await requirePagePermission("roles.view");
  const { id } = await props.params;
  const role = await getRole(user.organizationId, id, canManageProtected(user.access));
  if (!role) notFound();

  return (
    <>
      <PageHeader
        title={role.name}
        description="Tick what this role may do. Changes apply on the users' next page load."
      />
      <PermissionMatrix
        role={role}
        canManage={can(user.access, "roles.manage") && (!role.isProtected || canManageProtected(user.access))}
        ownPermissions={[...user.access.permissions.keys()]}
        hiddenPermissions={canManageProtected(user.access) ? [] : ["users.manage_protected", "audit.view"]}
      />
    </>
  );
}
