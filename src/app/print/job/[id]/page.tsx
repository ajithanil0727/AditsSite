import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { getJob } from "@/modules/service/jobs.queries";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Job card" };

/** Job card / intake receipt handed to the customer (and a copy pinned to the device). */
export default async function PrintJobPage(props: PageProps<"/print/job/[id]">) {
  const user = await requirePagePermission("jobcards.view");
  const { id } = await props.params;
  const detail = await getJob(user, id);
  if (!detail) notFound();
  const { job } = detail;
  const company = await getCompanyProfile(user.organizationId);
  const device = [job.device.deviceType.name, job.device.brand?.name, job.device.model?.name ?? job.device.modelText]
    .filter(Boolean)
    .join(" · ");
  const advance = job.payments.filter((p) => p.kind === "ADVANCE").reduce((a, p) => a + Number(p.amount), 0);

  return (
    <article className="mx-auto max-w-[210mm] bg-card p-6 text-[13px] text-card-foreground shadow-sm sm:p-8 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {company.logoUrl && <img src={company.logoUrl} alt="" className="size-14 object-contain" />}
          <div>
            <div className="text-lg font-bold">{company.name}</div>
            <div className="text-muted-foreground">
              {job.branch.name} · {company.phone}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">JOB CARD</div>
          <div className="font-mono text-base font-semibold">{job.jobNo}</div>
          <div>{formatDateTime(job.receivedAt)}</div>
        </div>
      </header>

      <section className="grid gap-4 border-b py-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase">Customer</div>
          <div className="font-semibold">{job.customer.name}</div>
          {job.customer.phone && <div>{job.customer.phone}</div>}
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase">Device</div>
          <div className="font-semibold">{device}</div>
          <div>
            {[
              job.device.imei && `IMEI ${job.device.imei}`,
              job.device.serialNo && `S/N ${job.device.serialNo}`,
              job.device.color,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </section>

      <section className="space-y-3 border-b py-4">
        <div>
          <span className="text-muted-foreground">Problem reported: </span>
          {job.problemReported}
        </div>
        <div>
          <span className="text-muted-foreground">Accessories received: </span>
          {job.accessories.length ? job.accessories.join(", ") : "None"}
        </div>
        {job.conditionNotes && (
          <div>
            <span className="text-muted-foreground">Condition: </span>
            {job.conditionNotes}
          </div>
        )}
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <span>
            <span className="text-muted-foreground">Estimate: </span>
            {job.estimatedCost != null ? formatINR(Number(job.estimatedCost)) : "After diagnosis"}
          </span>
          <span>
            <span className="text-muted-foreground">Expected by: </span>
            {job.estimatedAt ? formatDate(job.estimatedAt) : "We'll call you"}
          </span>
          {advance > 0 && (
            <span>
              <span className="text-muted-foreground">Advance paid: </span>
              {formatINR(advance)}
            </span>
          )}
        </div>
        {job.isWarrantyJob && job.parentJob && (
          <div className="font-medium">Warranty repeat of job {job.parentJob.jobNo}</div>
        )}
      </section>

      <section className="py-4 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Terms</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>
            Please bring this job card when collecting the device. Track your repair online with the job number and your
            phone number.
          </li>
          <li>We are not responsible for data loss. Please back up your data.</li>
          <li>Devices not collected within 60 days of the &quot;ready&quot; message may be disposed of.</li>
          <li>Repair warranty covers the same fault only; physical or liquid damage voids it.</li>
        </ol>
      </section>

      <footer className="mt-8 flex justify-between gap-6 text-xs">
        <div>Customer signature</div>
        <div className="text-right">Received by {job.receivedBy.name}</div>
      </footer>
    </article>
  );
}
