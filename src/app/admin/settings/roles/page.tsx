import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { listRoles } from "@/modules/roles/roles.service";
import { CreateRoleDialog } from "./create-role-dialog";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const user = await requirePagePermission("roles.view");
  const roles = await listRoles(user.organizationId);
  const canManage = can(user.access, "roles.manage");

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="A role is a group of permissions. The scope (own / assigned branches / all branches) is set when a role is given to a user."
        actions={
          canManage && (
            <CreateRoleDialog
              roles={roles.map((r) => ({ id: r.id, name: r.name }))}
              trigger={
                <Button>
                  <PlusIcon /> New role
                </Button>
              }
            />
          )
        }
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/admin/settings/roles/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.isSystem && (
                    <Badge variant="outline" className="ml-2">
                      Default
                    </Badge>
                  )}
                  {r.isProtected && (
                    <Badge variant="secondary" className="ml-2">
                      Super admin only
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-sm truncate text-muted-foreground md:table-cell">
                  {r.description}
                </TableCell>
                <TableCell>
                  {r.permissionCount} / {ALL_PERMISSIONS.length}
                </TableCell>
                <TableCell>{r.userCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
