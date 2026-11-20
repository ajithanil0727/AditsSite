"use client";

import { FileTextIcon, SearchIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { StatusBadge, toTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { trackRepair, type TrackResult } from "@/modules/service/tracker";

const STEPS = [
  { key: ["RECEIVED"], label: "Received" },
  { key: ["DIAGNOSIS", "QUOTE_SENT", "APPROVED", "REJECTED"], label: "Diagnosis" },
  { key: ["IN_REPAIR", "WAITING_PARTS", "QC"], label: "Repair" },
  { key: ["READY"], label: "Ready" },
  { key: ["DELIVERED"], label: "Delivered" },
];

export function TrackForm() {
  const [jobNo, setJobNo] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => setResult(await trackRepair({ jobNo, phone })));
  };

  const job = result?.ok ? result.job : null;
  const stepIndex = job ? STEPS.findIndex((s) => s.key.includes(job.stage)) : -1;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="jobNo">Job number</Label>
          <Input
            id="jobNo"
            value={jobNo}
            onChange={(e) => setJobNo(e.target.value)}
            placeholder="KOC/JC/26-27/00042"
            required
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="98470 12345"
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          <SearchIcon /> {pending ? "Checking…" : "Track"}
        </Button>
      </form>

      {result && !result.ok && (
        <p role="alert" className="rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
          {result.error}
        </p>
      )}

      {job && (
        <Card>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm text-muted-foreground">Hi {job.firstName}, your</div>
                <div className="text-lg font-semibold">{job.device}</div>
                <div className="font-mono text-sm text-muted-foreground">{job.jobNo}</div>
              </div>
              <StatusBadge tone={toTone(job.tone)} className="text-sm">
                {job.status}
              </StatusBadge>
            </div>

            {stepIndex >= 0 && (
              <ol className="grid grid-cols-5 gap-1" aria-label="Repair progress">
                {STEPS.map((s, i) => (
                  <li key={s.label} className="text-center text-xs">
                    <div className={`mb-1 h-1.5 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} />
                    <span className={i <= stepIndex ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
                  </li>
                ))}
              </ol>
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Received</dt>
              <dd>{formatDate(job.receivedAt)}</dd>
              {job.estimatedAt && !job.deliveredAt && (
                <>
                  <dt className="text-muted-foreground">Expected by</dt>
                  <dd>{formatDate(job.estimatedAt)}</dd>
                </>
              )}
              {job.deliveredAt && (
                <>
                  <dt className="text-muted-foreground">Delivered</dt>
                  <dd>{formatDate(job.deliveredAt)}</dd>
                </>
              )}
              {job.warrantyUntil && (
                <>
                  <dt className="text-muted-foreground">Warranty until</dt>
                  <dd>{formatDate(job.warrantyUntil)}</dd>
                </>
              )}
              {job.amountDue !== null && job.amountDue > 0 && (
                <>
                  <dt className="text-muted-foreground">Amount due</dt>
                  <dd className="font-medium">{formatINR(job.amountDue)}</dd>
                </>
              )}
            </dl>

            {job.quote && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">Quotation</span>
                  <span className="text-muted-foreground">
                    {job.quote.status === "APPROVED"
                      ? "Approved"
                      : job.quote.status === "REJECTED"
                        ? "Declined"
                        : job.quote.status === "EXPIRED"
                          ? "Expired"
                          : "Waiting for your decision"}
                    {job.quote.validUntil && job.quote.status === "SENT" ? ` · valid until ${formatDate(job.quote.validUntil)}` : ""}
                  </span>
                </div>
                <ul className="divide-y rounded-md border text-sm">
                  {job.quote.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
                      <span>
                        {it.description}
                        {it.qty !== 1 ? ` × ${it.qty}` : ""}
                      </span>
                      <span className="tabular-nums">{formatINR(it.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-2 px-3 py-1.5 font-medium">
                    <span>Total (incl. GST)</span>
                    <span className="tabular-nums">{formatINR(job.quote.total)}</span>
                  </li>
                </ul>
                {job.quote.status === "SENT" && (
                  <p className="text-xs text-muted-foreground">To approve or decline, call or WhatsApp {job.branch.name} on {job.branch.phone}.</p>
                )}
              </div>
            )}

            {job.invoice && (
              <a
                href={job.invoice.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <FileTextIcon className="size-4" /> Invoice {job.invoice.number}
              </a>
            )}

            {job.notes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Updates from our team</div>
                {job.notes.map((n, i) => (
                  <p key={i} className="rounded-md bg-muted px-3 py-2 text-sm">
                    {n.note}
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(n.at)}</span>
                  </p>
                ))}
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Full history</summary>
              <ul className="mt-2 space-y-1">
                {job.timeline.map((t, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{t.status}</span>
                    <span className="text-muted-foreground">{formatDateTime(t.at)}</span>
                  </li>
                ))}
              </ul>
            </details>

            <p className="text-sm text-muted-foreground">
              Questions? Call {job.branch.name}:{" "}
              <a className="font-medium text-foreground" href={`tel:${job.branch.phone}`}>
                {job.branch.phone}
              </a>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
