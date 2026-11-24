import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge, toTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { partPickerOptions, paymentFormOptions } from "@/modules/inventory/inventory.queries";
import { engineerOptions, getJob, labourOptions } from "@/modules/service/jobs.queries";
import { PRIORITY_LABELS } from "@/modules/service/service.schemas";
import { ChargesCard } from "./charges-card";
import { JobActions } from "./job-actions";
import { MoneyCard } from "./money-card";
import { PhotosAndUnlock } from "./photos-unlock";
import { TimelineCard } from "./timeline-card";

export const metadata: Metadata = { title: "Job card" };

export default async function JobPage(props: PageProps<"/admin/service/jobs/[id]">) {
  const user = await requirePagePermission("jobcards.view");
  const { id } = await props.params;
  const detail = await getJob(user, id);
  if (!detail) notFound();
  const { job } = detail;
  const [parts, labour, payment, engineers] = await Promise.all([
    detail.can.issuePart || detail.can.requestPart || detail.can.quote
      ? partPickerOptions(user.organizationId, job.branchId)
      : Promise.resolve([]),
    detail.can.editCharges || detail.can.quote ? labourOptions(user.organizationId) : Promise.resolve([]),
    paymentFormOptions(user.organizationId, [job.branchId]),
    detail.can.assign ? engineerOptions(user.organizationId, [job.branchId]) : Promise.resolve([]),
  ]);
  const sentQuote = job.quotations.find((q) => q.status === "SENT");
  const device = [job.device.deviceType.name, job.device.brand?.name, job.device.model?.name ?? job.device.modelText]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title={job.jobNo}
        description={`${job.customer.name} · ${device}`}
        actions={
          <>
            <StatusBadge tone={toTone(job.status.color)}>{job.status.name}</StatusBadge>
            {job.isWarrantyJob && <StatusBadge tone="lavender">Warranty repeat</StatusBadge>}
            <Button asChild variant="outline" size="sm">
              <Link href={`/print/job/${job.id}`} target="_blank">
                <PrinterIcon /> Job card
              </Link>
            </Button>
          </>
        }
      />
      <JobActions
        jobId={job.id}
        can={detail.can}
        nextStatuses={detail.nextStatuses}
        engineers={engineers.map((e) => ({ value: e.value, label: e.label }))}
        assigned={{ engineerId: job.assignedEngineerId, priority: job.priority }}
        diagnosis={job.diagnosis ?? ""}
        latestQuote={
          sentQuote ? { id: sentQuote.id, version: sentQuote.version, total: Number(sentQuote.total) } : null
        }
        quoteDraft={detail.lines.map((l) => ({
          kind: l.kind,
          partId: l.partId,
          serviceRateId: null,
          description: l.description,
          qty: String(l.qty),
          unitPrice: String(l.listPrice),
        }))}
        parts={parts}
        labour={labour}
        due={detail.due}
        chargesTotal={detail.chargesTotal}
        hasInvoice={!!detail.invoice}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ChargesCard
            jobId={job.id}
            lines={detail.lines}
            jobParts={job.parts.map((p) => ({
              id: p.id,
              name: p.part.name,
              sku: p.part.sku,
              unit: p.part.unit.symbol,
              qty: Number(p.qty),
              returnedQty: Number(p.returnedQty),
              isFree: p.isFreeWarranty,
            }))}
            requests={job.partRequests.map((r) => ({
              id: r.id,
              part: r.part.name,
              sku: r.part.sku,
              partId: r.partId,
              qty: Number(r.qty),
              status: r.status,
              by: r.requestedBy.name,
              note: r.note,
            }))}
            total={detail.chargesTotal}
            isWarrantyJob={job.isWarrantyJob}
            warrantyPartsFree={job.warrantyPartsFree}
            estimate={job.estimatedCost != null ? Number(job.estimatedCost) : null}
            can={detail.can}
            parts={parts}
            labour={labour}
          />
          {job.quotations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Quotations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.quotations.map((q) => (
                  <details key={q.id} className="rounded-lg border p-3" open={q.status === "SENT"}>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        Version {q.version} · {formatDateTime(q.sentAt ?? q.createdAt)} · {q.createdBy.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge
                          tone={
                            q.status === "APPROVED"
                              ? "mint"
                              : q.status === "REJECTED"
                                ? "danger"
                                : q.status === "SENT"
                                  ? "sky"
                                  : "neutral"
                          }
                        >
                          {q.status.toLowerCase()}
                        </StatusBadge>
                        <span className="font-medium tabular-nums">₹{Number(q.total).toFixed(2)}</span>
                      </span>
                    </summary>
                    <ul className="mt-2 divide-y text-sm">
                      {q.items.map((i) => (
                        <li key={i.id} className="flex justify-between gap-2 py-1">
                          <span>
                            {i.description} × {Number(i.qty)}
                          </span>
                          <span className="tabular-nums">₹{Number(i.amount).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                    {q.decisionNote && <p className="mt-2 text-xs text-muted-foreground">Note: {q.decisionNote}</p>}
                  </details>
                ))}
              </CardContent>
            </Card>
          )}
          <MoneyCard
            jobId={job.id}
            invoice={
              detail.invoice
                ? {
                    id: detail.invoice.id,
                    invoiceNo: detail.invoice.invoiceNo,
                    grandTotal: Number(detail.invoice.grandTotal),
                    kind: detail.invoice.kind,
                  }
                : null
            }
            cancelledInvoices={job.invoices
              .filter((i) => i.status === "CANCELLED")
              .map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, reason: i.cancelReason }))}
            payments={job.payments.map((p) => ({
              id: p.id,
              receiptNo: p.receiptNo,
              kind: p.kind,
              amount: Number(p.amount),
              mode: p.paymentMode.name,
              reference: p.reference,
              at: p.paidAt.toISOString(),
              by: p.receivedBy.name,
            }))}
            netPaid={detail.netPaid}
            due={detail.due}
            chargesTotal={detail.chargesTotal}
            can={detail.can}
            payment={payment}
          />
          <TimelineCard
            jobId={job.id}
            history={job.history.map((h) => ({
              id: h.id,
              status: h.toStatus.name,
              tone: h.toStatus.color,
              by: h.changedBy.name,
              note: h.note,
              at: h.createdAt.toISOString(),
            }))}
            notes={job.notes.map((n) => ({
              id: n.id,
              note: n.note,
              by: n.user.name,
              at: n.createdAt.toISOString(),
              customerVisible: !n.isInternal,
            }))}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {job.customer.phone ? (
                <>
                  <Link href={`/admin/service/customers/${job.customerId}`} className="font-medium hover:underline">
                    {job.customer.name}
                  </Link>
                  <div>
                    {job.customer.phone}
                    {job.customer.altPhone ? ` · ${job.customer.altPhone}` : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium">{job.customer.name}</div>
                  <div className="text-xs text-muted-foreground">Contact the customer through the service desk.</div>
                </>
              )}
              {job.customer.gstin && <div className="font-mono text-xs">GSTIN {job.customer.gstin}</div>}
              {job.customer.address && <div className="text-muted-foreground">{job.customer.address}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Device & problem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="font-medium">{device}</div>
                <div className="text-muted-foreground">
                  {[
                    job.device.imei && `IMEI ${job.device.imei}`,
                    job.device.serialNo && `S/N ${job.device.serialNo}`,
                    job.device.color,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No IMEI / serial"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{job.problemCategory?.name ?? "Problem"}</div>
                <p className="whitespace-pre-wrap">{job.problemReported}</p>
              </div>
              {job.diagnosis && (
                <div>
                  <div className="text-xs text-muted-foreground">Diagnosis</div>
                  <p className="whitespace-pre-wrap">{job.diagnosis}</p>
                </div>
              )}
              {job.accessories.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground">Accessories</div>
                  {job.accessories.join(", ")}
                </div>
              )}
              {job.conditionNotes && (
                <div>
                  <div className="text-xs text-muted-foreground">Condition</div>
                  <p className="whitespace-pre-wrap">{job.conditionNotes}</p>
                </div>
              )}
              <PhotosAndUnlock
                jobId={job.id}
                photos={detail.photos}
                canAdd={detail.can.addPhoto}
                hasUnlockCode={detail.hasUnlockCode}
                canReveal={detail.can.revealUnlock}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Branch</dt>
                <dd>{job.branch.name}</dd>
                <dt className="text-muted-foreground">Received</dt>
                <dd>
                  {formatDateTime(job.receivedAt)} by {job.receivedBy.name}
                </dd>
                <dt className="text-muted-foreground">Engineer</dt>
                <dd>{job.assignedEngineer?.name ?? "Unassigned"}</dd>
                <dt className="text-muted-foreground">Priority</dt>
                <dd>{PRIORITY_LABELS[job.priority]}</dd>
                <dt className="text-muted-foreground">Estimate</dt>
                <dd>{job.estimatedCost != null ? `₹${Number(job.estimatedCost).toFixed(0)}` : "—"}</dd>
                <dt className="text-muted-foreground">Promised</dt>
                <dd>{job.estimatedAt ? formatDate(job.estimatedAt) : "—"}</dd>
                {job.qcAt && (
                  <>
                    <dt className="text-muted-foreground">QC passed</dt>
                    <dd>
                      {formatDateTime(job.qcAt)} · {job.qcBy?.name}
                    </dd>
                  </>
                )}
                {job.deliveredAt && (
                  <>
                    <dt className="text-muted-foreground">Delivered</dt>
                    <dd>
                      {formatDateTime(job.deliveredAt)} · {job.deliveredBy?.name}
                      {job.deliveredOnCredit ? " · on credit" : ""}
                    </dd>
                  </>
                )}
                {job.tatMinutes != null && (
                  <>
                    <dt className="text-muted-foreground">Turnaround</dt>
                    <dd>
                      {Math.floor(job.tatMinutes / 60)} h {job.tatMinutes % 60} min
                    </dd>
                  </>
                )}
                {job.warrantyUntil && (
                  <>
                    <dt className="text-muted-foreground">Warranty</dt>
                    <dd>
                      {job.warrantyDays} days · until {formatDate(job.warrantyUntil)}
                    </dd>
                  </>
                )}
                {job.parentJob && (
                  <>
                    <dt className="text-muted-foreground">Repeat of</dt>
                    <dd>
                      <Link className="font-mono hover:underline" href={`/admin/service/jobs/${job.parentJob.id}`}>
                        {job.parentJob.jobNo}
                      </Link>
                    </dd>
                  </>
                )}
                {job.comebacks.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Came back as</dt>
                    <dd>
                      {job.comebacks.map((c) => (
                        <Link
                          key={c.id}
                          className="mr-2 font-mono hover:underline"
                          href={`/admin/service/jobs/${c.id}`}
                        >
                          {c.jobNo}
                        </Link>
                      ))}
                    </dd>
                  </>
                )}
                {job.cancelReason && (
                  <>
                    <dt className="text-muted-foreground">Cancelled</dt>
                    <dd>{job.cancelReason}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
