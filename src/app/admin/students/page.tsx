import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { courseOptions } from "@/modules/courses/courses.queries";
import { can } from "@/modules/rbac/access";
import { listStudents } from "@/modules/students/students.queries";
import { StudentsTable } from "./students-table";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage(props: PageProps<"/admin/students">) {
  const user = await requirePagePermission("students.view");
  const params = parseListParams(await props.searchParams, { sortable: ["name"] });
  const [{ rows, total }, courses] = await Promise.all([
    listStudents(user, params, await getActiveBranchId(user)),
    courseOptions(user.organizationId),
  ]);
  return (
    <>
      <PageHeader
        title="Students"
        description="Search by name, phone or student ID."
        actions={
          can(user.access, "students.create") && (
            <Button asChild>
              <Link href="/admin/students/new">
                <PlusIcon /> New admission
              </Link>
            </Button>
          )
        }
      />
      <StudentsTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        courses={courses.map((c) => ({ value: c.value, label: c.label }))}
      />
    </>
  );
}
