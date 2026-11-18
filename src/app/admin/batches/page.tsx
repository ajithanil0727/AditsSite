import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { courseOptions, listBatches, trainerOptions } from "@/modules/courses/courses.queries";
import { branchConstraint, canAccessBranch } from "@/modules/rbac/access";
import { BatchFormDialog } from "./batch-form";
import { BatchesTable } from "./batches-table";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage(props: PageProps<"/admin/batches">) {
  const user = await requirePagePermission("batches.view");
  const params = parseListParams(await props.searchParams);
  const [activeBranchId, selectable] = await Promise.all([getActiveBranchId(user), getSelectableBranches(user)]);
  const instituteIds = new Set(
    (
      await db.branch.findMany({
        where: { id: { in: selectable.map((b) => b.id) }, kind: { in: ["INSTITUTE", "BOTH"] } },
        select: { id: true },
      })
    ).map((b) => b.id),
  );
  const createBranches = selectable.filter(
    (b) => instituteIds.has(b.id) && canAccessBranch(user.access, "batches.create", b.id),
  );
  const [{ rows, total }, courses, trainers] = await Promise.all([
    listBatches(user, params, activeBranchId),
    courseOptions(user.organizationId),
    trainerOptions(user.organizationId, [...instituteIds]),
  ]);
  const own = branchConstraint(user.access, "batches.view", null).ownOnly;

  return (
    <>
      <PageHeader
        title={own ? "My batches" : "Batches"}
        description="Course batches per branch: timing, trainer, capacity and attendance."
        actions={
          createBranches.length > 0 && (
            <BatchFormDialog
              branches={createBranches.map((b) => ({ value: b.id, label: b.name }))}
              courses={courses.map((c) => ({ value: c.value, label: c.label }))}
              trainers={trainers}
              today={istDateOnly(new Date()).toISOString().slice(0, 10)}
              trigger={
                <Button>
                  <PlusIcon /> New batch
                </Button>
              }
            />
          )
        }
      />
      <BatchesTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        courses={courses.map((c) => ({ value: c.value, label: c.label }))}
      />
    </>
  );
}
