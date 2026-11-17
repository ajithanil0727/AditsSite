import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/current";
import { MASTERS } from "@/modules/masters/registry";
import { can } from "@/modules/rbac/access";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Master data" };

export default async function MastersIndexPage() {
  const user = await requireUser();
  const defs = Object.values(MASTERS).filter((d) => can(user.access, d.permission));
  if (defs.length === 0) redirect("/admin/no-access");
  const groups = [...new Set(defs.map((d) => d.group))];

  return (
    <>
      <PageHeader title="Master data" description="Lists used across the system. Everything here is editable." />
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{g}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {defs
                .filter((d) => d.group === g)
                .map((d) => (
                  <Link
                    key={d.kind}
                    href={`/admin/settings/masters/${d.kind}`}
                    className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base">{d.label}</CardTitle>
                        <CardDescription>{d.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
