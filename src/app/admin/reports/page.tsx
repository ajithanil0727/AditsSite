import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { REPORTS } from "@/modules/reports/reports";

export const metadata: Metadata = { title: "Reports" };

/** Reports the user may run, grouped by module. Accounts reports (P&L, day book) stay under Accounts. */
export default async function ReportsPage() {
  const user = await requirePagePermission("reports.view");
  const list = REPORTS.filter((r) => can(user.access, r.permission));
  if (list.length === 0) redirect("/admin/no-access");
  const groups = [...new Set(list.map((r) => r.group))];
  const extra = [
    can(user.access, "reports.financial") && { href: "/admin/accounts/pnl", title: "Profit & loss", description: "Branch and combined P&L (Accounts)." },
    can(user.access, "accounts.view_daybook") && { href: "/admin/accounts/daybook", title: "Day book", description: "Money in and out per account (Accounts)." },
    can(user.access, "leads.view") && { href: "/admin/leads/report", title: "Enquiry conversion", description: "Enquiries by source and counsellor." },
    can(user.access, "placements.view") && { href: "/admin/placements/stats", title: "Placement stats", description: "Placement % by branch, course and batch." },
  ].filter((x): x is { href: string; title: string; description: string } => !!x);
  return (
    <>
      <PageHeader title="Reports" description="Pick a period and branch, then view, print / save as PDF, or download Excel." />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{g}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list
                .filter((r) => r.group === g)
                .map((r) => (
                  <Link key={r.key} href={`/admin/reports/${r.key}`} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base">{r.title}</CardTitle>
                        <CardDescription>{r.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
            </div>
          </section>
        ))}
        {extra.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Elsewhere</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {extra.map((r) => (
                <Link key={r.href} href={r.href} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <CardDescription>{r.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
