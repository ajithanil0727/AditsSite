import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { amountInWords, formatDate, formatINR } from "@/lib/format";
import { requireUser } from "@/modules/auth/current";
import { getPayslip } from "@/modules/hr/hr.queries";
import { MONTHS } from "@/modules/hr/hr.schemas";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Payslip" };

/** Payslip. Staff can open their own (finalised months); payroll viewers can open their branches'. */
export default async function PrintPayslipPage(props: PageProps<"/print/payslip/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const s = await getPayslip(user, id);
  if (!s) notFound();
  const company = await getCompanyProfile(user.organizationId);
  const run = s.payrollRun;
  const earnings = s.items.filter((i) => i.type === "EARNING");
  const deductions = s.items.filter((i) => i.type === "DEDUCTION");
  const net = Number(s.netPay);
  const earnedTotal = Number(s.grossEarnings) - Number(s.lopAmount) + Number(s.incentives);
  const deductionTotal = Number(s.otherDeductions) + Number(s.advanceRecovery);

  return (
    <article className="mx-auto max-w-[210mm] bg-card p-8 text-[13px] text-card-foreground shadow-sm print:shadow-none">
      {run.status === "DRAFT" && (
        <div className="mb-4 rounded-md border-2 border-warning px-3 py-2 text-center font-semibold text-warning">DRAFT: not final</div>
      )}
      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {company.logoUrl && <img src={company.logoUrl} alt="" className="size-12 object-contain" />}
          <div>
            <div className="text-lg font-bold">{company.legalName || company.name}</div>
            <div className="text-muted-foreground">
              {run.branch.name} · {[run.branch.addressLine1, run.branch.city].filter(Boolean).join(", ")}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">PAYSLIP</div>
          <div>
            {MONTHS[run.month - 1]} {run.year}
          </div>
        </div>
      </header>

      <section className="grid gap-x-8 gap-y-1 border-b py-4 sm:grid-cols-2">
        {[
          ["Employee", s.employee.name],
          ["Employee ID", s.employee.employeeCode],
          ["Designation", s.employee.designation?.name ?? "—"],
          ["Department", s.employee.department?.name ?? "—"],
          ["Joined", formatDate(s.employee.joinDate)],
          ["Days in month", String(s.daysInMonth)],
          ["Paid days", String(Number(s.paidDays))],
          ["Loss-of-pay days", String(Number(s.lopDays))],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </section>

      <section className="grid gap-6 py-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 font-semibold">Earnings</div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1">
            {earnings.map((i) => (
              <div key={i.id} className="contents">
                <dt>{i.label}</dt>
                <dd className="text-right tabular-nums">{formatINR(Number(i.amount))}</dd>
              </div>
            ))}
            {s.incentiveLines.map((i, idx) => (
              <div key={idx} className="contents">
                <dt>Incentive: {i.reason}</dt>
                <dd className="text-right tabular-nums">{formatINR(Number(i.amount))}</dd>
              </div>
            ))}
            {Number(s.lopAmount) > 0 && (
              <p className="col-span-2 text-xs text-muted-foreground">
                Full-month salary {formatINR(Number(s.grossEarnings))}, less {formatINR(Number(s.lopAmount))} for {Number(s.lopDays)} loss-of-pay day(s).
              </p>
            )}
            <dt className="border-t pt-1 font-semibold">Total earnings</dt>
            <dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatINR(earnedTotal)}</dd>
          </dl>
        </div>
        <div>
          <div className="mb-2 font-semibold">Deductions</div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1">
            {deductions.map((i) => (
              <div key={i.id} className="contents">
                <dt>{i.label}</dt>
                <dd className="text-right tabular-nums">{formatINR(Number(i.amount))}</dd>
              </div>
            ))}
            {Number(s.advanceRecovery) > 0 && (
              <>
                <dt>Salary advance recovery</dt>
                <dd className="text-right tabular-nums">{formatINR(Number(s.advanceRecovery))}</dd>
              </>
            )}
            {deductionTotal === 0 && <dt className="col-span-2 text-muted-foreground">None</dt>}
            <dt className="border-t pt-1 font-semibold">Total deductions</dt>
            <dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatINR(deductionTotal)}</dd>
          </dl>
        </div>
      </section>

      <section className="rounded-lg bg-muted/50 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold">Net pay</span>
          <span className="text-2xl font-bold tabular-nums">{formatINR(net)}</span>
        </div>
        <div className="mt-1 text-muted-foreground">{amountInWords(net)}</div>
        {s.paidAt && (
          <div className="mt-1 text-muted-foreground">
            Paid on {formatDate(s.paidAt)}
            {s.moneyAccount ? ` from ${s.moneyAccount.name}` : ""}
          </div>
        )}
      </section>
      <footer className="mt-8 text-xs text-muted-foreground">This is a computer-generated payslip and needs no signature.</footer>
    </article>
  );
}
