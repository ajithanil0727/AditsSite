import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { formatINR } from "@/lib/format";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { courseOptions } from "@/modules/courses/courses.queries";
import { listDues } from "@/modules/students/students.queries";
import { DuesTable } from "./dues-table";

export const metadata: Metadata = { title: "Fee dues" };

export default async function DuesPage(props: PageProps<"/admin/fees/dues">) {
  const user = await requirePagePermission("fees.view");
  const params = parseListParams(await props.searchParams, { defaultPageSize: 50 });
  const [{ rows, total, sum }, courses] = await Promise.all([
    listDues(user, params, await getActiveBranchId(user)),
    courseOptions(user.organizationId),
  ]);
  const when = params.filters.when ?? "overdue";
  return (
    <>
      <PageHeader
        title="Fee dues"
        description={`${when === "overdue" ? "Overdue" : when === "week" ? "Due within a week (incl. overdue)" : "All unpaid"}: ${formatINR(sum)} across ${total} instalment${total === 1 ? "" : "s"}.`}
      />
      <DuesTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        courses={courses.map((c) => ({ value: c.value, label: c.label }))}
      />
    </>
  );
}
