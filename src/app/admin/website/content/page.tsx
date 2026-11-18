import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { CONTENT } from "@/modules/website/content-registry";

export const metadata: Metadata = { title: "Website content" };

export default async function ContentIndexPage() {
  const user = await requireUser();
  const defs = Object.values(CONTENT).filter((d) => can(user.access, d.permission) || can(user.access, "website.view"));
  if (defs.length === 0) redirect("/admin/no-access");
  return (
    <>
      <PageHeader
        title="Website content"
        description="Lists that appear on the website. Courses are edited in Courses, branches in Settings → Branches."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {defs.map((d) => (
          <Link
            key={d.kind}
            href={`/admin/website/content/${d.kind}`}
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
    </>
  );
}
