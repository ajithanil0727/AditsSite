"use client";

import {
  ArrowRightIcon,
  BanIcon,
  CheckCheckIcon,
  FileTextIcon,
  PackageCheckIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UserCogIcon,
  Undo2Icon,
} from "lucide-react";
import { Controller, useFieldArray, useWatch, type Control } from "react-hook-form";
import { z } from "zod";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { SelectField, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { PartPicker, type PickerPart } from "@/components/forms/part-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import type { JobDetail } from "@/modules/service/jobs.queries";
import {
  assignJobAction,
  returnJobAction,
  cancelJobAction,
  changeStatusAction,
  createInvoiceAction,
  deliverAction,
  quoteDecisionAction,
  sendQuoteAction,
} from "@/modules/service/jobs.actions";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  assignSchema,
  cancelJobSchema,
  deliverSchema,
  quoteDecisionSchema,
  quoteSchema,
  statusChangeSchema,
  type QuoteInput,
} from "@/modules/service/service.schemas";

type Opt = { value: string; label: string };
type QuoteLine = QuoteInput["items"][number];

function QuoteLines({
  control,
  parts,
  labour,
}: {
  control: Control<QuoteInput, unknown, z.output<typeof quoteSchema>>;
  parts: PickerPart[];
  labour: (Opt & { amount: number })[];
}) {
  const { fields, append, remove, update } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" }) ?? [];
  const total = items.reduce((a, i) => a + Number(i?.qty || 0) * Number(i?.unitPrice || 0), 0);
  return (
    <div className="space-y-2">
      {fields.map((f, i) => {
        const line = items[i] ?? f;
        return (
          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <Select
              value={line.kind}
              onValueChange={(v) =>
                update(i, { ...line, kind: v as QuoteLine["kind"], partId: null, serviceRateId: null })
              }
            >
              <SelectTrigger className="w-28" aria-label="Line type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PART">Part</SelectItem>
                <SelectItem value="LABOUR">Labour</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <div className="min-w-[12rem] flex-1">
              {line.kind === "PART" ? (
                <PartPicker
                  parts={parts}
                  value={line.partId ?? null}
                  onChange={(p) =>
                    update(i, {
                      ...line,
                      partId: p.id,
                      description: p.name,
                      unitPrice: p.salePrice != null ? String(p.salePrice) : line.unitPrice,
                    })
                  }
                />
              ) : line.kind === "LABOUR" ? (
                <Select
                  value={line.serviceRateId ?? "__custom"}
                  onValueChange={(v) => {
                    const rate = labour.find((l) => l.value === v);
                    update(i, {
                      ...line,
                      serviceRateId: rate?.value ?? null,
                      description: rate?.label ?? line.description,
                      unitPrice: rate ? String(rate.amount) : line.unitPrice,
                    });
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Labour">
                    <SelectValue placeholder="Labour charge" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom">Custom labour…</SelectItem>
                    {labour.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {(line.kind === "OTHER" || (line.kind === "LABOUR" && !line.serviceRateId)) && (
                <Controller
                  control={control}
                  name={`items.${i}.description`}
                  render={({ field }) => <Input {...field} placeholder="Description" className="mt-1" />}
                />
              )}
            </div>
            <Controller
              control={control}
              name={`items.${i}.qty`}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  type="number"
                  min={0}
                  step="1"
                  className="w-20"
                  aria-label="Qty"
                />
              )}
            />
            <Controller
              control={control}
              name={`items.${i}.unitPrice`}
              render={({ field }) => (
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  type="number"
                  min={0}
                  step="1"
                  className="w-28"
                  aria-label="Price incl. GST"
                  placeholder="₹ incl. GST"
                />
              )}
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(i)}>
              <Trash2Icon />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({ kind: "PART", partId: null, serviceRateId: null, description: "", qty: "1", unitPrice: "" })
          }
        >
          <PlusIcon /> Add line
        </Button>
        <span className="text-sm">
          Total <span className="font-semibold tabular-nums">{formatINR(total)}</span>{" "}
          <span className="text-muted-foreground">(incl. GST)</span>
        </span>
      </div>
    </div>
  );
}

const returnSchema = z.object({ id: z.string().min(1), reason: z.string().trim().max(200).optional().nullable() });

export function JobActions({
  jobId,
  can,
  nextStatuses,
  engineers,
  assigned,
  diagnosis,
  latestQuote,
  quoteDraft,
  parts,
  labour,
  due,
  chargesTotal,
  hasInvoice,
}: {
  jobId: string;
  can: JobDetail["can"];
  nextStatuses: (Opt & { key: string })[];
  engineers: Opt[];
  assigned: { engineerId: string | null; priority: (typeof PRIORITIES)[number] };
  diagnosis: string;
  latestQuote: { id: string; version: number; total: number } | null;
  quoteDraft: QuoteLine[];
  parts: PickerPart[];
  labour: (Opt & { amount: number })[];
  due: number | null;
  chargesTotal: number;
  hasInvoice: boolean;
}) {
  const owesMoney = (due ?? 0) > 0.001;
  return (
    <div className="flex flex-wrap gap-2">
      {can.changeStatus && (
        <FormDialog
          trigger={
            <Button>
              <ArrowRightIcon /> Move to…
            </Button>
          }
          title="Change status"
          schema={statusChangeSchema}
          defaultValues={{ jobId, statusId: nextStatuses[0]?.value ?? "", note: "", diagnosis }}
          action={changeStatusAction}
          successMessage="Status updated"
        >
          {(form) => (
            <>
              <SelectField control={form.control} name="statusId" label="New status" options={nextStatuses} />
              <TextareaField control={form.control} name="diagnosis" label="Diagnosis / findings" rows={3} />
              <TextField control={form.control} name="note" label="Note for the timeline" />
            </>
          )}
        </FormDialog>
      )}
      {can.returnToShelf && (
        <FormDialog
          trigger={
            <Button variant="outline">
              <Undo2Icon /> Return to shelf
            </Button>
          }
          title="Return this job to the shelf?"
          description="It becomes unassigned so another engineer can take it. The service manager and the branch's engineers are told."
          schema={returnSchema}
          defaultValues={{ id: jobId, reason: "" }}
          action={returnJobAction}
          submitLabel="Return to shelf"
          successMessage="Back on the shelf"
        >
          {(form) => (
            <TextField
              control={form.control}
              name="reason"
              label="Why? (optional)"
              placeholder="Needs a board-level specialist"
            />
          )}
        </FormDialog>
      )}
      {can.assign && (
        <FormDialog
          trigger={
            <Button variant="outline">
              <UserCogIcon /> Assign
            </Button>
          }
          title="Assign engineer"
          schema={assignSchema}
          defaultValues={{ jobId, engineerId: assigned.engineerId, priority: assigned.priority }}
          action={assignJobAction}
          successMessage="Assignment saved"
        >
          {(form) => (
            <>
              <SelectField
                control={form.control}
                name="engineerId"
                label="Engineer"
                options={engineers}
                allowNone="Unassigned"
              />
              <SelectField
                control={form.control}
                name="priority"
                label="Priority"
                options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
              />
            </>
          )}
        </FormDialog>
      )}
      {can.quote && (
        <FormDialog
          wide
          trigger={
            <Button variant="outline">
              <SendIcon /> Send quotation
            </Button>
          }
          title="Send quotation"
          description="Prices include GST. The job waits for the customer's decision; repair can't start above the estimate without approval."
          schema={quoteSchema}
          defaultValues={{
            jobId,
            validUntil: "",
            items: quoteDraft.length
              ? quoteDraft
              : [{ kind: "PART", partId: null, serviceRateId: null, description: "", qty: "1", unitPrice: "" }],
          }}
          action={sendQuoteAction}
          submitLabel="Send quotation"
          successMessage="Quotation sent"
        >
          {(form) => (
            <>
              <QuoteLines control={form.control} parts={parts} labour={labour} />
              <TextField control={form.control} name="validUntil" label="Valid until" type="date" />
            </>
          )}
        </FormDialog>
      )}
      {can.recordDecision && latestQuote && (
        <FormDialog
          trigger={
            <Button variant="outline">
              <CheckCheckIcon /> Customer decision
            </Button>
          }
          title={`Quotation v${latestQuote.version} · ${formatINR(latestQuote.total)}`}
          schema={quoteDecisionSchema}
          defaultValues={{ jobId, quotationId: latestQuote.id, decision: "APPROVED", via: "PHONE", note: "" }}
          action={quoteDecisionAction}
          successMessage="Decision recorded"
        >
          {(form) => (
            <>
              <SelectField
                control={form.control}
                name="decision"
                label="Decision"
                options={[
                  { value: "APPROVED", label: "Approved" },
                  { value: "REJECTED", label: "Rejected" },
                ]}
              />
              <SelectField
                control={form.control}
                name="via"
                label="How"
                options={[
                  { value: "PHONE", label: "Phone call" },
                  { value: "IN_PERSON", label: "In person" },
                  { value: "WHATSAPP", label: "WhatsApp" },
                ]}
              />
              <TextField control={form.control} name="note" label="Note" />
            </>
          )}
        </FormDialog>
      )}
      {can.invoice && (
        <ConfirmAction
          title="Issue the invoice?"
          description={`Invoice for ${formatINR(chargesTotal)} (GST-inclusive). Parts and labour are locked once it's issued. Any advance is adjusted.`}
          confirmLabel="Issue invoice"
          successMessage="Invoice issued"
          action={() => createInvoiceAction({ jobId })}
          trigger={
            <Button>
              <FileTextIcon /> Issue invoice
            </Button>
          }
        />
      )}
      {can.deliver && (
        <FormDialog
          trigger={
            <Button>
              <PackageCheckIcon /> Deliver
            </Button>
          }
          title="Hand over the device"
          description={
            !hasInvoice && chargesTotal > 0
              ? "Issue the invoice first."
              : owesMoney
                ? `${formatINR(due ?? 0)} is still due. Collect it first${can.deliverCredit ? ", or deliver on credit" : ""}.`
                : "Check the accessories are returned. Warranty starts today."
          }
          schema={deliverSchema}
          defaultValues={{ jobId, onCredit: false }}
          action={deliverAction}
          submitLabel="Deliver"
          successMessage="Delivered"
        >
          {(form) =>
            owesMoney && can.deliverCredit ? (
              <SwitchField control={form.control} name="onCredit" label="Deliver on credit (balance due)" />
            ) : null
          }
        </FormDialog>
      )}
      {can.cancel && (
        <FormDialog
          trigger={
            <Button variant="ghost" className="text-destructive">
              <BanIcon /> Cancel job
            </Button>
          }
          title="Cancel this job?"
          description="Unused parts go back to stock. Refund any advance first."
          schema={cancelJobSchema}
          defaultValues={{ jobId, reason: "" }}
          action={cancelJobAction}
          submitLabel="Cancel job"
          destructive
          successMessage="Job cancelled"
        >
          {(form) => <TextField control={form.control} name="reason" label="Reason" />}
        </FormDialog>
      )}
    </div>
  );
}
