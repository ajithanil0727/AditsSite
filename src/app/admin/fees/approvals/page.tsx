import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatINR } from "@/lib/format";
import { requireUser } from "@/modules/auth/current";
import { paymentFormOptions } from "@/modules/inventory/inventory.queries";
import { canAny } from "@/modules/rbac/access";
import { listApprovals } from "@/modules/students/students.queries";
import { DecisionButtons, PayRefundDialog } from "./approval-actions";

export const metadata: Metadata = { title: "Fee approvals" };

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (!canAny(user.access, ["fees.discount_approve", "fees.refund_approve", "fees.collect"]))
    redirect("/admin/no-access");
  const { discounts, refunds, toPay } = await listApprovals(user);
  const pay = toPay.length
    ? await paymentFormOptions(user.organizationId, [...new Set(toPay.map((r) => r.branchId))])
    : null;

  const Student = ({ s, course }: { s: { id: string; name: string; studentCode: string }; course: string }) => (
    <span>
      <Link href={`/admin/students/${s.id}`} className="font-medium hover:underline">
        {s.name}
      </Link>
      <span className="text-xs text-muted-foreground">
        {" "}
        · {s.studentCode} · {course}
      </span>
    </span>
  );

  return (
    <>
      <PageHeader
        title="Fee approvals"
        description="Discounts above the requester's limit, refunds, and approved refunds waiting to be paid. You can't approve your own requests."
      />
      <div className="grid max-w-5xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Discounts ({discounts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {discounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting.</p>
            ) : (
              <ul className="divide-y text-sm">
                {discounts.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="space-y-0.5">
                      <Student s={d.enrollment.student} course={d.enrollment.course.code} />
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{formatINR(Number(d.amount))}</span> of{" "}
                        {formatINR(Number(d.enrollment.courseFee))}
                        {Number(d.enrollment.discountAmount) > 0 &&
                          ` (already ${formatINR(Number(d.enrollment.discountAmount))} off)`}{" "}
                        · {d.reason}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.requestedBy.name} · {formatDateTime(d.createdAt)} · {d.branch.code}
                      </div>
                    </div>
                    <DecisionButtons kind="discount" id={d.id} own={d.requestedBy.id === user.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Refunds to approve ({refunds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {refunds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting.</p>
            ) : (
              <ul className="divide-y text-sm">
                {refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="space-y-0.5">
                      <Student s={r.enrollment.student} course={r.enrollment.course.code} />
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{formatINR(Number(r.amount))}</span> · {r.reason}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.requestedBy.name} · {formatDateTime(r.createdAt)} · {r.branch.code}
                      </div>
                    </div>
                    <DecisionButtons kind="refund" id={r.id} own={r.requestedBy.id === user.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {toPay.length > 0 && pay && (
          <Card>
            <CardHeader>
              <CardTitle>Approved refunds to pay ({toPay.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {toPay.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <Student s={r.enrollment.student} course={r.enrollment.course.code} />
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">{formatINR(Number(r.amount))}</span> · {r.reason}
                      </div>
                    </div>
                    <PayRefundDialog
                      id={r.id}
                      amount={Number(r.amount)}
                      modes={pay.modes}
                      accounts={pay.accounts.filter((a) => a.branchId === r.branch.id)}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
