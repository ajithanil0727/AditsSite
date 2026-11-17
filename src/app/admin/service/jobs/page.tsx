import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { branchConstraint, can } from "@/modules/rbac/access";
import { engineerOptions, listJobs } from "@/modules/service/jobs.queries";
import { JobsTable } from "./jobs-table";

export const metadata: Metadata = { title: "Job cards" };

export default async function JobsPage(props: PageProps<"/admin/service/jobs">) {
  const user = await requirePagePermission("jobcards.view");
  const params = parseListParams(await props.searchParams, {
    sortable: ["receivedAt", "estimatedAt"],
    defaultPageSize: 50,
  });
  const activeBranchId = await getActiveBranchId(user);
  const scope = branchConstraint(user.access, "jobcards.view", activeBranchId);
  const [{ rows, total }, engineers, statuses] = await Promise.all([
    listJobs(user, params, activeBranchId),
    scope.ownOnly ? Promise.resolve([]) : engineerOptions(user.organizationId, scope.branchIds),
    db.jobStatus.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const keys = [...new Map(statuses.map((s) => [s.systemKey, s.name])).entries()];

  return (
    <>
      <PageHeader
        title={scope.ownOnly ? "My job cards" : "Job cards"}
        description="Search by job number, customer name or phone, IMEI or serial number."
        actions={
          can(user.access, "jobcards.create") && (
            <Button asChild>
              <Link href="/admin/service/intake">
                <PlusIcon /> New intake
              </Link>
            </Button>
          )
        }
      />
      <JobsTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        statusOptions={keys.map(([value, label]) => ({ value, label }))}
        engineers={engineers.map((e) => ({ value: e.value, label: e.label }))}
      />
    </>
  );
}
