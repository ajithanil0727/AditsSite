import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { requirePagePermission } from "@/modules/auth/current";
import { courseFormOptions, listCourses } from "@/modules/courses/courses.queries";
import { can } from "@/modules/rbac/access";
import { CourseFormDialog } from "./course-form";
import { CoursesTable } from "./courses-table";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage(props: PageProps<"/admin/courses">) {
  const user = await requirePagePermission("courses.view");
  const params = parseListParams(await props.searchParams);
  const [{ rows, total }, options] = await Promise.all([
    listCourses(user, params),
    courseFormOptions(user.organizationId),
  ]);
  return (
    <>
      <PageHeader
        title="Courses"
        description="Courses offered across all branches. Fees and syllabus are set here; batches run them per branch."
        actions={
          can(user.access, "courses.manage") && (
            <CourseFormDialog
              options={options}
              trigger={
                <Button>
                  <PlusIcon /> New course
                </Button>
              }
            />
          )
        }
      />
      <CoursesTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} />
    </>
  );
}
