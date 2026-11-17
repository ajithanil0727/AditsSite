import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { amountInWords, formatDateTime, formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { canAccessBranch } from "@/modules/rbac/access";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Receipt" };

const TITLES = { ADVANCE: "ADVANCE RECEIPT", PAYMENT: "PAYMENT RECEIPT", REFUND: "REFUND VOUCHER" } as const;

export default async function PrintReceiptPage(props: PageProps<"/print/receipt/[id]">) {
  const user = await requirePagePermission("jobcards.view");
  const { id } = await props.params;
  const pay = await db.servicePayment.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      paymentMode: { select: { name: true } },
      receivedBy: { select: { name: true } },
      invoice: { select: { invoiceNo: true } },
      branch: { select: { name: true, phone: true } },
      jobCard: { select: { jobNo: true, customer: { select: { name: true, phone: true } } } },
    },
  });
  if (!pay || !canAccessBranch(user.access, "jobcards.view", pay.branchId)) notFound();
  const company = await getCompanyProfile(user.organizationId);
  const amount = Number(pay.amount);

  return (
    <article className="mx-auto max-w-[148mm] bg-card p-6 text-[13px] text-card-foreground shadow-sm print:shadow-none">
      <header className="border-b pb-3 text-center">
        <div className="text-lg font-bold">{company.name}</div>
        <div className="text-muted-foreground">
          {pay.branch.name} · {pay.branch.phone}
        </div>
        <div className="mt-2 font-semibold tracking-wide">{TITLES[pay.kind]}</div>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-4">
        <dt className="text-muted-foreground">Receipt no.</dt>
        <dd className="font-mono">{pay.receiptNo}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{formatDateTime(pay.paidAt)}</dd>
        <dt className="text-muted-foreground">{pay.kind === "REFUND" ? "Paid to" : "Received from"}</dt>
        <dd>
          {pay.jobCard.customer.name} · {pay.jobCard.customer.phone}
        </dd>
        <dt className="text-muted-foreground">Against</dt>
        <dd>
          Job card <span className="font-mono">{pay.jobCard.jobNo}</span>
          {pay.invoice ? (
            <>
              {" "}
              · Invoice <span className="font-mono">{pay.invoice.invoiceNo}</span>
            </>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">Mode</dt>
        <dd>
          {pay.paymentMode.name}
          {pay.reference ? ` (${pay.reference})` : ""}
        </dd>
        <dt className="font-semibold">Amount</dt>
        <dd className="text-base font-semibold">{formatINR(amount)}</dd>
      </dl>
      <p className="border-t pt-3">{amountInWords(amount)}</p>
      <footer className="mt-10 flex justify-between text-xs text-muted-foreground">
        <span>{pay.kind === "ADVANCE" ? "Adjusted against the final invoice." : ""}</span>
        <span>{pay.receivedBy.name}</span>
      </footer>
    </article>
  );
}
