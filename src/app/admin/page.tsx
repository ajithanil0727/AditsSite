import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { dashboardData } from "@/modules/dashboard/dashboard.queries";

export const metadata: Metadata = { title: "Dashboard" };

const TONE = {
  mint: "bg-mint text-mint-foreground",
  sky: "bg-sky text-sky-foreground",
  peach: "bg-peach text-peach-foreground",
  lavender: "bg-lavender text-lavender-foreground",
  danger: "bg-destructive/10 text-destructive",
} as const;

/** Role-based dashboard: only the figures the signed-in person's permissions allow, for their branches. */
export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
  const [branches, activeBranchId] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  const { tiles, lists } = await dashboardData(user, activeBranchId);
  const activeName = activeBranchId ? branches.find((b) => b.id === activeBranchId)?.name : null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={activeName ? `Showing ${activeName}.` : "Showing all the branches you can access."}
      />
      {tiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.key} href={t.href} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardDescription className="flex items-center justify-between gap-2">
                    {t.label}
                    <span className={cn("size-2.5 rounded-full", TONE[t.tone])} aria-hidden />
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-3xl tabular-nums">{t.value}</CardTitle>
                  {t.hint && <p className="mt-1 text-sm text-muted-foreground">{t.hint}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {lists.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {lists.map((l) => (
            <Card key={l.key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{l.title}</CardTitle>
                {l.href !== "/admin" && (
                  <Link href={l.href} className="flex items-center text-sm text-muted-foreground hover:text-foreground">
                    All <ChevronRightIcon className="size-4" />
                  </Link>
                )}
              </CardHeader>
              <CardContent>
                {l.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{l.empty}</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {l.items.map((i) => (
                      <li key={i.id}>
                        <Link href={i.href} className="flex items-center justify-between gap-2 py-2 hover:underline">
                          <span>
                            <span className="font-medium">{i.label}</span>
                            <span className="block text-xs text-muted-foreground">{i.sub}</span>
                          </span>
                          {i.badge && <StatusBadge tone={i.badge === "overdue" ? "danger" : "peach"}>{i.badge}</StatusBadge>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {tiles.length === 0 && lists.length === 0 && (
        <p className="text-sm text-muted-foreground">Use the menu on the left to get started.</p>
      )}
    </>
  );
}
