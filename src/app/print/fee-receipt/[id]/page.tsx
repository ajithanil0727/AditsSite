import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { amountInWords, formatDate, formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { canAccessBranch } from "@/modules/rbac/access";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Fee receipt" };

/** Fee receipt (no GST invoice for fees yet: Phase 3 decision, pending the CA's advice). */
export default async function PrintFeeReceiptPage(props: PageProps<"/print/fee-receipt/[id]">) {
  const user = await requirePagePermission("fees.view");
  const { id } = await props.params;
  const pay = await db.feePayment.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      paymentMode: { select: { name: true } },
      collectedBy: { select: { name: true } },
      branch: { select: { name: true, phone: true, addressLine1: true, city: true } },
      allocations: { include: { installment: { select: { label: true } } } },
      enrollment: {
        include: {
          student: { select: { name: true, studentCode: true, phone: true } },
          course: { select: { name: true } },
          installments: { select: { amount: true, paidAmount: true, status: true } },
        },
      },
    },
  });
  if (!pay || !canAccessBranch(user.access, "fees.view", pay.branchId)) notFound();
  const company = await getCompanyProfile(user.organizationId);
  const amount = Number(pay.amount);
  const balance = pay.enrollment.installments
    .filter((i) => i.status === "DUE" || i.status === "PARTIAL")
    .reduce((a, i) => a + Number(i.amount) - Number(i.paidAmount), 0);

  return (
    <article className="mx-auto max-w-[148mm] bg-card p-6 text-[13px] text-card-foreground shadow-sm print:shadow-none">
      {pay.cancelledAt && (
        <div className="mb-3 rounded border-2 border-destructive px-2 py-1 text-center font-semibold text-destructive">
          CANCELLED{pay.cancelReason ? `: ${pay.cancelReason}` : ""}
        </div>
      )}
      <header className="border-b pb-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {company.logoUrl && <img src={company.logoUrl} alt="" className="mx-auto mb-1 size-12 object-contain" />}
        <div className="text-lg font-bold">{company.name}</div>
        <div className="text-muted-foreground">
          {pay.branch.name} · {pay.branch.addressLine1}, {pay.branch.city} · {pay.branch.phone}
        </div>
        <div className="mt-2 font-semibold tracking-wide">FEE RECEIPT</div>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-4">
        <dt className="text-muted-foreground">Receipt no.</dt>
        <dd className="font-mono">{pay.receiptNo}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{formatDate(pay.paidAt)}</dd>
        <dt className="text-muted-foreground">Student</dt>
        <dd>
          {pay.enrollment.student.name} ({pay.enrollment.student.studentCode})
        </dd>
        <dt className="text-muted-foreground">Course</dt>
        <dd>{pay.enrollment.course.name}</dd>
        <dt className="text-muted-foreground">Towards</dt>
        <dd>{pay.allocations.map((a) => a.installment.label).join(", ")}</dd>
        <dt className="text-muted-foreground">Mode</dt>
        <dd>
          {pay.paymentMode.name}
          {pay.reference ? ` (${pay.reference})` : ""}
        </dd>
        <dt className="font-semibold">Amount</dt>
        <dd className="text-base font-semibold">{formatINR(amount)}</dd>
        {!pay.cancelledAt && (
          <>
            <dt className="text-muted-foreground">Balance due</dt>
            <dd>{formatINR(balance)}</dd>
          </>
        )}
      </dl>
      <p className="border-t pt-3">{amountInWords(amount)}</p>
      <footer className="mt-10 flex justify-between text-xs text-muted-foreground">
        <span>Fees once paid are refundable only as per the institute&apos;s refund policy.</span>
        <span>{pay.collectedBy.name}</span>
      </footer>
    </article>
  );
}
