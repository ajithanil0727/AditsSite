import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDate, formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { studentAcademics } from "@/modules/academics/academics.queries";
import { requirePagePermission } from "@/modules/auth/current";
import { batchOptions } from "@/modules/courses/courses.queries";
import { paymentFormOptions } from "@/modules/inventory/inventory.queries";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { getStudent } from "@/modules/students/students.queries";
import { ENROLL_LABEL, ENROLL_TONE } from "../students-table";
import { EnrollmentAcademics } from "./enrollment-academics";
import { PortalAccess } from "./portal-access";
import { EnrollmentActions, StudentEditDialog } from "./student-actions";

export const metadata: Metadata = { title: "Student" };

const INST_TONE = { DUE: "sky", PARTIAL: "peach", PAID: "mint", WAIVED: "neutral" } as const;

export default async function StudentPage(props: PageProps<"/admin/students/[id]">) {
  const user = await requirePagePermission("students.view");
  const { id } = await props.params;
  const data = await getStudent(user, id);
  if (!data) notFound();
  const { student: s, enrollments } = data;
  const sp = await props.searchParams;
  const today = istDateOnly(new Date());
  const todayYmd = today.toISOString().slice(0, 10);
  const branchIds = [...new Set(enrollments.map((x) => x.e.branchId))];
  const academics = await studentAcademics(user, s.id);
  const portalUser = s.userId
    ? await db.user.findUnique({ where: { id: s.userId }, select: { isActive: true, accounts: { where: { providerId: "credential" }, select: { id: true } } } })
    : null;
  const portalState = !portalUser ? "none" : !portalUser.isActive ? "off" : portalUser.accounts.length ? "active" : "invited";
  const [pay, allInstituteBranches] = await Promise.all([
    paymentFormOptions(user.organizationId, branchIds),
    db.branch.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, kind: { in: ["INSTITUTE", "BOTH"] } },
      select: { id: true, name: true },
    }),
  ]);
  const transferBatches = await batchOptions(
    user.organizationId,
    allInstituteBranches.map((b) => b.id),
  );

  return (
    <>
      {sp.admitted && (
        <p className="mb-4 rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground">
          Admission saved.{sp.discount === "pending" ? " The discount is waiting for approval." : ""}
        </p>
      )}
      <PageHeader
        title={s.name}
        description={`${s.studentCode} · ${s.phone}${s.email ? ` · ${s.email}` : ""} · ${s.branch.name}`}
        actions={
          <>
            {canAccessBranch(user.access, "students.update", s.branchId) && (
              <StudentEditDialog
                initial={{
                  id: s.id,
                  name: s.name,
                  phone: s.phone,
                  altPhone: s.altPhone ?? "",
                  email: s.email ?? "",
                  dob: s.dob ? s.dob.toISOString().slice(0, 10) : "",
                  gender: s.gender,
                  guardianName: s.guardianName ?? "",
                  guardianPhone: s.guardianPhone ?? "",
                  address: s.address ?? "",
                  city: s.city ?? "",
                  state: s.state ?? "",
                  pincode: s.pincode ?? "",
                  qualification: s.qualification ?? "",
                }}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit details
                  </Button>
                }
              />
            )}
            {can(user.access, "students.create") && (
              <Button asChild variant="outline">
                <Link href="/admin/students/new">
                  <PlusIcon /> Another course
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {enrollments.length === 0 && <p className="text-sm text-muted-foreground">No enrollments you can see.</p>}
          {enrollments.map(
            ({ e, received, refunded, due, overdue, refundable, attendance, sessions, pendingDiscount, inBranch }) => (
              <Card key={e.id}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>{e.course.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {e.branch.name} ·{" "}
                      {e.batch ? (
                        <Link className="hover:underline" href={`/admin/batches/${e.batch.id}`}>
                          {e.batch.name} ({e.batch.timing})
                        </Link>
                      ) : (
                        "No batch yet"
                      )}{" "}
                      · admitted {formatDate(e.enrolledAt)}
                    </p>
                  </div>
                  <StatusBadge tone={ENROLL_TONE[e.status]}>{ENROLL_LABEL[e.status]}</StatusBadge>
                </CardHeader>
                <CardContent className="space-y-5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Course fee</dt>
                      <dd className="tabular-nums">{formatINR(Number(e.courseFee))}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Discount</dt>
                      <dd className="tabular-nums">
                        {formatINR(Number(e.discountAmount))}
                        {pendingDiscount && <span className="text-xs text-muted-foreground"> + pending</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Received</dt>
                      <dd className="tabular-nums">
                        {formatINR(received)}
                        {refunded > 0 && (
                          <span className="block text-xs text-muted-foreground">−{formatINR(refunded)} refunded</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Due</dt>
                      <dd className={overdue > 0 ? "font-medium text-destructive tabular-nums" : "tabular-nums"}>
                        {formatINR(due)}
                        {overdue > 0 && <span className="block text-xs">{formatINR(overdue)} overdue</span>}
                      </dd>
                    </div>
                  </dl>

                  <EnrollmentActions
                    enrollmentId={e.id}
                    status={e.status}
                    due={due}
                    refundable={refundable}
                    today={todayYmd}
                    branchId={e.branchId}
                    batchId={e.batchId}
                    courseId={e.courseId}
                    payment={{ modes: pay.modes, accounts: pay.accounts.filter((a) => a.branchId === e.branchId) }}
                    branches={allInstituteBranches.map((b) => ({ value: b.id, label: b.name }))}
                    batches={transferBatches.filter((b) => b.courseId === e.courseId)}
                    instalments={e.installments.map((i) => ({
                      id: i.id,
                      label: i.label,
                      due: Number(i.amount) - Number(i.paidAmount),
                      status: i.status,
                    }))}
                    can={{
                      collect: inBranch("fees.collect"),
                      discount: inBranch("fees.discount_request") && !pendingDiscount,
                      refund: inBranch("fees.refund_request"),
                      waive: inBranch("fees.waive"),
                      transfer: inBranch("students.transfer"),
                      update: inBranch("students.update"),
                    }}
                  />

                  <div>
                    <div className="mb-1 text-sm font-medium">Fee schedule</div>
                    <ul className="divide-y text-sm">
                      {e.installments.map((i) => {
                        const left = Number(i.amount) - Number(i.paidAmount);
                        const late = (i.status === "DUE" || i.status === "PARTIAL") && i.dueDate < today;
                        return (
                          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span>
                              {i.label} ·{" "}
                              <span className={late ? "text-destructive" : "text-muted-foreground"}>
                                due {formatDate(i.dueDate)}
                              </span>
                              {i.waivedReason && (
                                <span className="text-xs text-muted-foreground"> · {i.waivedReason}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums">{formatINR(Number(i.amount))}</span>
                              <StatusBadge tone={INST_TONE[i.status]}>
                                {i.status === "PARTIAL" ? `${formatINR(left)} left` : i.status.toLowerCase()}
                              </StatusBadge>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {e.payments.length > 0 && (
                    <div>
                      <div className="mb-1 text-sm font-medium">Receipts</div>
                      <ul className="divide-y text-sm">
                        {e.payments.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span className={p.cancelledAt ? "text-muted-foreground line-through" : ""}>
                              <Link
                                href={`/print/fee-receipt/${p.id}`}
                                target="_blank"
                                className="font-mono text-xs hover:underline"
                              >
                                {p.receiptNo}
                              </Link>{" "}
                              · {formatDate(p.paidAt)} · {p.paymentMode.name}
                              {p.reference ? ` (${p.reference})` : ""} · {p.collectedBy.name} · {p.branch.code}
                            </span>
                            <span className="flex items-center gap-2">
                              {p.cancelledAt && <StatusBadge tone="danger">Cancelled</StatusBadge>}
                              <span className="tabular-nums">{formatINR(Number(p.amount))}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(e.discountRequests.length > 0 || e.refunds.length > 0 || e.transfers.length > 0) && (
                    <div className="grid gap-4 text-sm sm:grid-cols-2">
                      {e.discountRequests.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium">Discounts</div>
                          <ul className="space-y-1 text-muted-foreground">
                            {e.discountRequests.map((d) => (
                              <li key={d.id}>
                                {formatINR(Number(d.amount))} · {d.reason} ·{" "}
                                <span className="text-foreground">{d.status.toLowerCase()}</span>
                                {d.decidedBy ? ` by ${d.decidedBy.name}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {e.refunds.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium">Refunds</div>
                          <ul className="space-y-1 text-muted-foreground">
                            {e.refunds.map((r) => (
                              <li key={r.id}>
                                {formatINR(Number(r.amount))} · {r.reason} ·{" "}
                                <span className="text-foreground">{r.paidAt ? "paid" : r.status.toLowerCase()}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {e.transfers.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium">Transfers</div>
                          <ul className="space-y-1 text-muted-foreground">
                            {e.transfers.map((t) => (
                              <li key={t.id}>
                                {formatDate(t.createdAt)} · {t.fromBranch.code} → {t.toBranch.code}
                                {t.reason ? ` · ${t.reason}` : ""} · {t.transferredBy.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground">
                    Attendance:{" "}
                    {attendance !== null
                      ? `${attendance}% over ${sessions} session${sessions === 1 ? "" : "s"}`
                      : "not marked yet"}
                    {e.dropReason && ` · Dropped: ${e.dropReason}`}
                  </p>
                  {(() => {
                    const a = academics.find((x) => x.enrollmentId === e.id);
                    return a ? (
                      <EnrollmentAcademics
                        a={a}
                        canOptOut={
                          canAccessBranch(user.access, "placements.manage_applications", e.branchId) ||
                          canAccessBranch(user.access, "students.update", e.branchId)
                        }
                        canViewCertificates={can(user.access, "certificates.view")}
                      />
                    ) : null;
                  })()}
                </CardContent>
              </Card>
            ),
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Student ID</dt>
              <dd className="font-mono">{s.studentCode}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>
                {s.phone}
                {s.altPhone ? ` · ${s.altPhone}` : ""}
              </dd>
              {s.dob && (
                <>
                  <dt className="text-muted-foreground">Born</dt>
                  <dd>{formatDate(s.dob)}</dd>
                </>
              )}
              {s.guardianName && (
                <>
                  <dt className="text-muted-foreground">Guardian</dt>
                  <dd>
                    {s.guardianName}
                    {s.guardianPhone ? ` · ${s.guardianPhone}` : ""}
                  </dd>
                </>
              )}
              {s.qualification && (
                <>
                  <dt className="text-muted-foreground">Qualification</dt>
                  <dd>{s.qualification}</dd>
                </>
              )}
              {(s.address || s.city) && (
                <>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd>{[s.address, s.city, s.state, s.pincode].filter(Boolean).join(", ")}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Since</dt>
              <dd>{formatDate(s.createdAt)}</dd>
            </dl>
            <div className="mt-4 border-t pt-4">
              <PortalAccess
                studentId={s.id}
                email={s.email}
                state={portalState}
                canManage={canAccessBranch(user.access, "students.update", s.branchId)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
