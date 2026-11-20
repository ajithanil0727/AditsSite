import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/modules/auth/current";
import { listCompanies } from "@/modules/placements/placements.queries";
import { can } from "@/modules/rbac/access";
import { CompaniesTable, CompanyDialog } from "./companies-view";

export const metadata: Metadata = { title: "Hiring companies" };

export default async function CompaniesPage(props: PageProps<"/admin/placements/companies">) {
  const user = await requirePagePermission("companies.view");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : null;
  const canManage = can(user.access, "companies.manage");
  return (
    <>
      <PageHeader
        title="Hiring companies"
        description="Companies that hire our students, with their contacts. Shared by all branches."
        actions={canManage && <CompanyDialog />}
      />
      <form className="mb-3" action="/admin/placements/companies">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search companies"
          aria-label="Search companies"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
      </form>
      <CompaniesTable rows={await listCompanies(user, q)} canManage={canManage} />
    </>
  );
}
