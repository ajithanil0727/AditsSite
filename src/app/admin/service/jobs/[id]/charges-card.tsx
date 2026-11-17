"use client";

import { Controller } from "react-hook-form";
import { PackagePlusIcon, PlusIcon, Undo2Icon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { TextField } from "@/components/forms/fields";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/forms/form-dialog";
import { PartPicker, type PickerPart } from "@/components/forms/part-picker";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { formatINR } from "@/lib/format";
import type { ChargeLine } from "@/modules/service/charges";
import type { JobDetail } from "@/modules/service/jobs.queries";
import {
  addLabourAction,
  issuePartAction,
  rejectPartRequestAction,
  removeLabourAction,
  requestPartAction,
  returnPartAction,
  setPartFreeAction,
  setWarrantyPartsFreeAction,
} from "@/modules/service/jobs.actions";
import { issuePartSchema, labourSchema, partRequestSchema, returnPartSchema } from "@/modules/service/service.schemas";

type Opt = { value: string; label: string };
type JobPartRow = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  returnedQty: number;
  isFree: boolean;
};
type RequestRow = {
  id: string;
  part: string;
  sku: string;
  partId: string;
  qty: number;
  status: string;
  by: string;
  note: string | null;
};

export function ChargesCard({
  jobId,
  lines,
  jobParts,
  requests,
  total,
  isWarrantyJob,
  warrantyPartsFree,
  estimate,
  can,
  parts,
  labour,
}: {
  jobId: string;
  lines: ChargeLine[];
  jobParts: JobPartRow[];
  requests: RequestRow[];
  total: number;
  isWarrantyJob: boolean;
  warrantyPartsFree: boolean;
  estimate: number | null;
  can: JobDetail["can"];
  parts: PickerPart[];
  labour: (Opt & { amount: number })[];
}) {
  const [pending, startTransition] = useTransition();
  const run = (p: Promise<{ ok: boolean; error?: string }>, msg: string) =>
    startTransition(async () => {
      const r = await p;
      if (r.ok) toast.success(msg);
      else toast.error((r as { error: string }).error);
    });
  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Parts & labour</CardTitle>
        <div className="flex flex-wrap gap-2">
          {can.issuePart && (
            <FormDialog
              trigger={
                <Button size="sm" variant="outline">
                  <PackagePlusIcon /> Issue part
                </Button>
              }
              title="Issue a part from stock"
              description="Stock is deducted now at average cost. The job is charged the sale price (incl. GST)."
              schema={issuePartSchema}
              defaultValues={{ jobId, partId: "", qty: "1", unitPrice: "", requestId: null }}
              action={issuePartAction}
              submitLabel="Issue"
              successMessage="Part issued"
            >
              {(form) => <IssueFields form={form} parts={parts} />}
            </FormDialog>
          )}
          {can.requestPart && !can.issuePart && (
            <FormDialog
              trigger={
                <Button size="sm" variant="outline">
                  <PackagePlusIcon /> Request part
                </Button>
              }
              title="Request a part from the store"
              schema={partRequestSchema}
              defaultValues={{ jobId, partId: "", qty: "1", note: "" }}
              action={requestPartAction}
              submitLabel="Send request"
              successMessage="Request sent to the store"
            >
              {(form) => (
                <>
                  <Controller
                    control={form.control}
                    name="partId"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Part</FieldLabel>
                        <PartPicker
                          parts={parts}
                          value={field.value || null}
                          onChange={(p) => field.onChange(p.id)}
                          invalid={fieldState.invalid}
                        />
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                  <TextField control={form.control} name="qty" label="Quantity" type="number" step="1" min={1} />
                  <TextField control={form.control} name="note" label="Note" />
                </>
              )}
            </FormDialog>
          )}
          {can.editCharges && (
            <FormDialog
              trigger={
                <Button size="sm" variant="outline">
                  <PlusIcon /> Labour
                </Button>
              }
              title="Add labour"
              schema={labourSchema}
              defaultValues={{ jobId, serviceRateId: null, description: "", amount: "" }}
              action={addLabourAction}
              successMessage="Labour added"
            >
              {(form) => <LabourFields form={form} labour={labour} />}
            </FormDialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isWarrantyJob && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-lavender px-3 py-2 text-sm text-lavender-foreground">
            <span>
              Warranty repeat job: labour is free.{warrantyPartsFree ? " Parts are free too." : " Parts are charged."}
            </span>
            {can.warrantyDecide && (
              <label className="flex items-center gap-2">
                <Switch
                  checked={warrantyPartsFree}
                  disabled={pending}
                  onCheckedChange={(v) =>
                    run(setWarrantyPartsFreeAction({ jobId, free: v }), v ? "Parts free" : "Parts charged")
                  }
                />
                Parts free
              </label>
            )}
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div className="space-y-2 rounded-md border border-peach p-3">
            <p className="text-sm font-medium">Waiting for the store</p>
            {pendingRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {r.part} × {r.qty}{" "}
                  <span className="text-muted-foreground">
                    · {r.by}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </span>
                {can.issuePart && (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          issuePartAction({
                            jobId,
                            partId: r.partId,
                            qty: String(r.qty),
                            unitPrice: "",
                            requestId: r.id,
                          }),
                          "Part issued",
                        )
                      }
                    >
                      Issue
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(rejectPartRequestAction({ requestId: r.id, note: null }), "Request rejected")}
                    >
                      Reject
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No parts or labour yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {lines.map((l) => {
              const jp = l.kind === "PART" ? jobParts.find((p) => p.id === l.sourceId) : null;
              return (
                <li key={l.sourceId} className="flex flex-wrap items-center gap-2 py-2">
                  <StatusBadge tone={l.kind === "PART" ? "sky" : "mint"}>
                    {l.kind === "PART" ? "Part" : "Labour"}
                  </StatusBadge>
                  <span className="flex-1">
                    {l.description}
                    {l.qty !== 1 && (
                      <span className="text-muted-foreground">
                        {" "}
                        × {l.qty}
                        {jp ? ` ${jp.unit}` : ""}
                      </span>
                    )}
                    {jp && jp.returnedQty > 0 && (
                      <span className="text-xs text-muted-foreground"> ({jp.returnedQty} returned)</span>
                    )}
                  </span>
                  {l.free ? (
                    <span className="text-sm">
                      <s className="text-muted-foreground">{formatINR(l.listPrice * l.qty)}</s>{" "}
                      <StatusBadge tone="lavender">Free</StatusBadge>
                    </span>
                  ) : (
                    <span className="tabular-nums">{formatINR(l.unitPrice * l.qty)}</span>
                  )}
                  {jp && can.warrantyDecide && !warrantyPartsFree && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          setPartFreeAction({ jobId, jobPartId: jp.id, free: !jp.isFree }),
                          jp.isFree ? "Part charged" : "Part free",
                        )
                      }
                    >
                      {jp.isFree ? "Charge" : "Free"}
                    </Button>
                  )}
                  {jp && can.issuePart && (
                    <FormDialog
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label="Return to stock">
                          <Undo2Icon />
                        </Button>
                      }
                      title={`Return ${jp.name} to stock`}
                      schema={returnPartSchema}
                      defaultValues={{ jobId, jobPartId: jp.id, qty: String(jp.qty - jp.returnedQty) }}
                      action={returnPartAction}
                      submitLabel="Return"
                      successMessage="Returned to stock"
                    >
                      {(form) => (
                        <TextField control={form.control} name="qty" label="Quantity" type="number" step="1" min={1} />
                      )}
                    </FormDialog>
                  )}
                  {l.kind === "LABOUR" && can.editCharges && (
                    <ConfirmAction
                      title="Remove this labour line?"
                      description={l.description}
                      confirmLabel="Remove"
                      destructive
                      action={() => removeLabourAction({ jobId, lineId: l.sourceId })}
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label="Remove">
                          <XIcon />
                        </Button>
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {estimate != null ? (
              <>
                Estimate {formatINR(estimate)}
                {total > estimate && <span className="font-medium text-destructive"> · above estimate</span>}
              </>
            ) : (
              "No estimate given"
            )}
          </span>
          <span>
            Total <span className="text-base font-semibold tabular-nums">{formatINR(total)}</span>{" "}
            <span className="text-muted-foreground">incl. GST</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function IssueFields({
  form,
  parts,
}: {
  form: Parameters<Parameters<typeof FormDialog<typeof issuePartSchema>>[0]["children"]>[0];
  parts: PickerPart[];
}) {
  return (
    <>
      <Controller
        control={form.control}
        name="partId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Part</FieldLabel>
            <PartPicker
              parts={parts}
              value={field.value || null}
              invalid={fieldState.invalid}
              onChange={(p) => {
                field.onChange(p.id);
                if (p.salePrice != null) form.setValue("unitPrice", String(p.salePrice));
              }}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField control={form.control} name="qty" label="Quantity" type="number" step="0.001" min={0} />
        <TextField
          control={form.control}
          name="unitPrice"
          label="Price each (₹ incl. GST)"
          type="number"
          step="1"
          min={0}
        />
      </div>
    </>
  );
}

function LabourFields({
  form,
  labour,
}: {
  form: Parameters<Parameters<typeof FormDialog<typeof labourSchema>>[0]["children"]>[0];
  labour: (Opt & { amount: number })[];
}) {
  return (
    <>
      <Controller
        control={form.control}
        name="serviceRateId"
        render={({ field }) => (
          <Field>
            <FieldLabel>Standard charge</FieldLabel>
            <Select
              value={field.value ?? "__custom"}
              onValueChange={(v) => {
                const rate = labour.find((l) => l.value === v);
                field.onChange(rate ? rate.value : null);
                if (rate) {
                  form.setValue("description", rate.label);
                  form.setValue("amount", String(rate.amount));
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__custom">Custom</SelectItem>
                {labour.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label} · {formatINR(l.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      <TextField control={form.control} name="description" label="Description" />
      <TextField control={form.control} name="amount" label="Amount (₹ incl. GST)" type="number" step="1" min={0} />
    </>
  );
}
