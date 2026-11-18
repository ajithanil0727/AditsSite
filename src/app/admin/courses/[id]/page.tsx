import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { GST_MODE_LABELS } from "@/modules/courses/courses.schemas";
import { courseFormOptions, getCourse } from "@/modules/courses/courses.queries";
import { can } from "@/modules/rbac/access";
import { CourseFormDialog } from "../course-form";
import { FeePlanDialog } from "./fee-plan-dialog";
import { ModulesEditor } from "./modules-editor";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage(props: PageProps<"/admin/courses/[id]">) {
  const user = await requirePagePermission("courses.view");
  const { id } = await props.params;
  const [course, options] = await Promise.all([
    getCourse(user.organizationId, id),
    courseFormOptions(user.organizationId),
  ]);
  if (!course) notFound();
  const canManage = can(user.access, "courses.manage");

  return (
    <>
      <PageHeader
        title={course.name}
        description={`${course.code} · ${course.durationValue} ${course.durationUnit.toLowerCase()} · ${formatINR(Number(course.fee))} · ${GST_MODE_LABELS[course.gstMode]}${course.taxRate ? ` (${course.taxRate.name})` : ""}`}
        actions={
          <>
            {course.isActive ? (
              <StatusBadge tone="mint">Active</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Inactive</StatusBadge>
            )}
            {canManage && (
              <CourseFormDialog
                options={options}
                initial={{
                  id: course.id,
                  code: course.code,
                  name: course.name,
                  slug: course.slug,
                  durationValue: String(course.durationValue),
                  durationUnit: course.durationUnit,
                  fee: course.fee.toString(),
                  gstMode: course.gstMode,
                  taxRateId: course.taxRateId,
                  hsnSacId: course.hsnSacId,
                  shortDescription: course.shortDescription ?? "",
                  eligibility: course.eligibility ?? "",
                  showOnWebsite: course.showOnWebsite,
                  isFeatured: course.isFeatured,
                  isActive: course.isActive,
                  sortOrder: String(course.sortOrder),
                }}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Fee plans</CardTitle>
            {canManage && (
              <FeePlanDialog
                courseId={course.id}
                trigger={
                  <Button size="sm" variant="outline">
                    New plan
                  </Button>
                }
              />
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {course.feePlans.map((p) => (
              <div key={p.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="flex items-center gap-2">
                    {!p.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                    {canManage && (
                      <FeePlanDialog
                        courseId={course.id}
                        initial={{
                          courseId: course.id,
                          id: p.id,
                          name: p.name,
                          isActive: p.isActive,
                          items: p.items.map((i) => ({
                            label: i.label,
                            percentOfFee: i.percentOfFee.toString(),
                            dueAfterDays: String(i.dueAfterDays),
                          })),
                        }}
                        trigger={
                          <Button size="sm" variant="ghost">
                            Edit
                          </Button>
                        }
                      />
                    )}
                  </span>
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {p.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span>
                        {i.label} · {i.dueAfterDays === 0 ? "at admission" : `after ${i.dueAfterDays} days`}
                      </span>
                      <span className="tabular-nums">
                        {Number(i.percentOfFee)}% · {formatINR((Number(course.fee) * Number(i.percentOfFee)) / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Syllabus modules</CardTitle>
          </CardHeader>
          <CardContent>
            <ModulesEditor
              courseId={course.id}
              canEdit={canManage}
              initial={course.modules.map((m) => ({ title: m.title, hours: m.hours != null ? String(m.hours) : "" }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
