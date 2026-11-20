import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { assessmentTypeOptions, batchAssessments } from "@/modules/academics/academics.queries";
import { requirePagePermission } from "@/modules/auth/current";
import { BATCH_STATUS_LABELS } from "@/modules/courses/courses.schemas";
import { courseOptions, getBatch, trainerOptions } from "@/modules/courses/courses.queries";
import { attendancePercent } from "@/modules/fees/fee-logic";
import { canAccessBranch, scopeOf } from "@/modules/rbac/access";
import { BatchFormDialog } from "../batch-form";
import { AttendanceSheet } from "./attendance-sheet";
import { AssessmentDialog, BatchAssessments } from "./batch-assessments";

export const metadata: Metadata = { title: "Batch" };

const ENROLL_TONE = { ACTIVE: "mint", ON_HOLD: "peach", COMPLETED: "lavender", DROPPED: "neutral" } as const;

export default async function BatchPage(props: PageProps<"/admin/batches/[id]">) {
  const user = await requirePagePermission("batches.view");
  const { id } = await props.params;
  const b = await getBatch(user, id);
  if (!b) notFound();
  const sp = await props.searchParams;
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const session = b.sessions.find((s) => s.date.toISOString().slice(0, 10) === date);
  const canEdit = canAccessBranch(user.access, "batches.update", b.branchId);
  const canMark =
    canAccessBranch(user.access, "student_attendance.mark", b.branchId) &&
    (scopeOf(user.access, "student_attendance.mark") !== "OWN" || b.trainerId === user.id);
  const active = b.enrollments.filter((e) => e.status === "ACTIVE" || e.status === "ON_HOLD");
  const ownOk = (p: "assessments.view" | "assessments.manage") =>
    canAccessBranch(user.access, p, b.branchId) && (scopeOf(user.access, p) !== "OWN" || b.trainerId === user.id);
  const canSeeAssessments = ownOk("assessments.view");
  const canManageAssessments = ownOk("assessments.manage");
  const [assessments, types] = await Promise.all([
    canSeeAssessments ? batchAssessments(b.id) : Promise.resolve([]),
    canManageAssessments ? assessmentTypeOptions(user.organizationId) : Promise.resolve([]),
  ]);
  const [courses, trainers] = canEdit
    ? await Promise.all([courseOptions(user.organizationId), trainerOptions(user.organizationId, [b.branchId])])
    : [[], []];

  return (
    <>
      <PageHeader
        title={b.name}
        description={`${b.course.name} · ${b.branch.name} · ${b.timing}${b.days ? ` · ${b.days}` : ""} · trainer ${b.trainer?.name ?? "not assigned"}`}
        actions={
          <>
            <StatusBadge tone="sky">{BATCH_STATUS_LABELS[b.status]}</StatusBadge>
            {canEdit && (
              <BatchFormDialog
                branches={[{ value: b.branchId, label: b.branch.name }]}
                courses={courses.map((c) => ({ value: c.value, label: c.label }))}
                trainers={trainers}
                today={today}
                initial={{
                  id: b.id,
                  branchId: b.branchId,
                  courseId: b.courseId,
                  code: b.code,
                  name: b.name,
                  trainerId: b.trainerId,
                  startDate: b.startDate.toISOString().slice(0, 10),
                  endDate: b.endDate ? b.endDate.toISOString().slice(0, 10) : "",
                  timing: b.timing,
                  days: b.days ?? "",
                  capacity: String(b.capacity),
                  status: b.status,
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
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active students in this batch.</p>
            ) : (
              <AttendanceSheet
                key={date}
                batchId={b.id}
                date={date}
                today={today}
                canMark={canMark}
                topic={session?.topic ?? ""}
                students={active.map((e) => ({
                  enrollmentId: e.id,
                  name: e.student.name,
                  code: e.student.studentCode,
                  status: session?.records.find((r) => r.enrollmentId === e.id)?.status ?? null,
                }))}
                markedBy={session?.takenBy?.name ?? null}
              />
            )}
          </CardContent>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Students ({active.length}/{b.capacity})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {b.enrollments.map((e) => {
                  const marks = b.sessions.flatMap((s) =>
                    s.records.filter((r) => r.enrollmentId === e.id).map((r) => r.status),
                  );
                  const pct = attendancePercent(marks);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/admin/students/${e.student.id}`} className="font-medium hover:underline">
                          {e.student.name}
                        </Link>
                        <span className="ml-1 font-mono text-xs text-muted-foreground">{e.student.studentCode}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {pct !== null && <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>}
                        <StatusBadge tone={ENROLL_TONE[e.status]}>
                          {e.status.toLowerCase().replace("_", " ")}
                        </StatusBadge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          {canSeeAssessments && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>Assessments</CardTitle>
                {canManageAssessments && types.length > 0 && (
                  <AssessmentDialog batchId={b.id} types={types} today={today} />
                )}
              </CardHeader>
              <CardContent>
                <BatchAssessments rows={assessments} students={active.length} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {b.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendance marked yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {b.sessions.slice(0, 12).map((s) => {
                    const present = s.records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
                    return (
                      <li key={s.id} className="flex justify-between gap-2 py-1.5">
                        <Link href={`?date=${s.date.toISOString().slice(0, 10)}`} className="hover:underline">
                          {formatDate(s.date)}
                          {s.topic ? ` · ${s.topic}` : ""}
                        </Link>
                        <span className="text-muted-foreground tabular-nums">
                          {present}/{s.records.length}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
