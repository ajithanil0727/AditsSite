import type { Metadata } from "next";
import Link from "next/link";
import { GitBranchIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
  const [branches, activeBranchId] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  const branchIds = activeBranchId ? [activeBranchId] : branches.map((b) => b.id);

  const [userCount, roleCount] = await Promise.all([
    can(user.access, "users.view")
      ? db.user.count({
          where: {
            organizationId: user.organizationId,
            deletedAt: null,
            isActive: true,
            branches: { some: { branchId: { in: branchIds } } },
          },
        })
      : null,
    can(user.access, "roles.view")
      ? db.role.count({ where: { organizationId: user.organizationId, deletedAt: null } })
      : null,
  ]);

  const activeName = activeBranchId ? branches.find((b) => b.id === activeBranchId)?.name : null;
  const cards = [
    {
      label: "Branches",
      value: activeBranchId ? 1 : branches.length,
      icon: GitBranchIcon,
      tone: "bg-sky text-sky-foreground",
      href: "/admin/settings/branches",
      show: can(user.access, "branches.view"),
    },
    {
      label: "Active users",
      value: userCount,
      icon: UsersIcon,
      tone: "bg-mint text-mint-foreground",
      href: "/admin/settings/users",
      show: userCount !== null,
    },
    {
      label: "Roles",
      value: roleCount,
      icon: ShieldCheckIcon,
      tone: "bg-lavender text-lavender-foreground",
      href: "/admin/settings/roles",
      show: roleCount !== null,
    },
  ].filter((c) => c.show);

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={activeName ? `Showing ${activeName}.` : "Showing all the branches you can access."}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardDescription>{c.label}</CardDescription>
                <span className={`flex size-9 items-center justify-center rounded-lg ${c.tone}`}>
                  <c.icon className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-3xl">{c.value}</CardTitle>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Module dashboards (admissions, collections, job cards, stock alerts…) arrive with their modules.
      </p>
    </>
  );
}
