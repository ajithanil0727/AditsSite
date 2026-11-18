"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SearchIcon, ShieldCheckIcon, UserCheckIcon, XIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { comebackCheckAction, intakeAction, lookupCustomerAction } from "@/modules/service/jobs.actions";
import { PRIORITIES, PRIORITY_LABELS, intakeSchema, type IntakeInput } from "@/modules/service/service.schemas";

type Opt = { value: string; label: string };
type Found = {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  gstin: string | null;
  devices: { id: string; deviceTypeId: string; label: string; imei: string | null; serialNo: string | null }[];
} | null;
type Comeback = { id: string; jobNo: string; deliveredAt: string | null; warrantyUntil: string; problem: string };

const ACCESSORIES = ["Charger", "Cable", "Battery", "SIM tray", "Memory card", "Back cover", "Case", "Bag", "Box"];

export function IntakeForm({
  branches,
  defaultBranchId,
  options,
  engineers,
  payment,
  lead,
}: {
  branches: Opt[];
  defaultBranchId: string;
  options: {
    deviceTypes: Opt[];
    brands: Opt[];
    models: (Opt & { brandId: string; deviceTypeId: string })[];
    problems: (Opt & { deviceTypeId: string | null })[];
  };
  engineers: (Opt & { branchIds: string[] })[];
  payment: { modes: (Opt & { requiresReference: boolean })[]; accounts: (Opt & { branchId: string })[] };
  /** Converting a repair enquiry: pre-fill from it and link it on save. */
  lead?: {
    id: string;
    name: string;
    phone: string;
    altPhone: string | null;
    email: string | null;
    deviceTypeId: string | null;
    deviceText: string | null;
    problemText: string | null;
  } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [looking, startLookup] = useTransition();
  const [found, setFound] = useState<Found | undefined>(undefined);
  const [comebacks, setComebacks] = useState<Comeback[]>([]);
  const [customAccessory, setCustomAccessory] = useState("");

  const form = useForm<IntakeInput, unknown, z.output<typeof intakeSchema>>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      branchId: defaultBranchId,
      leadId: lead?.id ?? null,
      customerId: null,
      customerName: lead?.name ?? "",
      customerPhone: lead?.phone ?? "",
      customerAltPhone: lead?.altPhone ?? "",
      customerEmail: lead?.email ?? "",
      customerAddress: "",
      customerGstin: "",
      deviceId: null,
      deviceTypeId:
        lead?.deviceTypeId && options.deviceTypes.some((d) => d.value === lead.deviceTypeId)
          ? lead.deviceTypeId
          : (options.deviceTypes[0]?.value ?? ""),
      brandId: null,
      modelId: null,
      modelText: lead?.deviceText ?? "",
      imei: "",
      serialNo: "",
      color: "",
      problemCategoryId: null,
      problemReported: lead?.problemText ?? "",
      accessories: [],
      conditionNotes: "",
      unlockCode: "",
      estimatedAt: "",
      estimatedCost: "",
      priority: "NORMAL",
      assignedEngineerId: null,
      parentJobId: null,
      advanceAmount: "",
      advanceModeId: payment.modes[0]?.value ?? null,
      advanceAccountId: null,
      advanceReference: "",
    },
  });
  const w = useWatch({ control: form.control });
  const branchId = w.branchId ?? defaultBranchId;
  const accessories = w.accessories ?? [];
  const usingSavedDevice = !!w.deviceId;

  const lookup = () => {
    const phone = form.getValues("customerPhone") ?? "";
    startLookup(async () => {
      const res = await lookupCustomerAction({ phone });
      if (!res.ok) return void form.setError("customerPhone", { message: res.fieldErrors?.phone?.[0] ?? res.error });
      setFound(res.data);
      form.setValue("customerId", res.data?.id ?? null);
      form.setValue("deviceId", null);
      if (res.data) {
        form.setValue("customerName", res.data.name);
        form.setValue("customerGstin", res.data.gstin ?? "");
        toast.success(`Returning customer: ${res.data.name}`);
      }
    });
  };

  // Converting an enquiry: look the customer up straight away.
  const leadPhone = lead?.phone;
  useEffect(() => {
    if (!leadPhone) return;
    startLookup(async () => {
      const res = await lookupCustomerAction({ phone: leadPhone });
      if (!res.ok) return;
      setFound(res.data);
      form.setValue("customerId", res.data?.id ?? null);
      if (res.data) form.setValue("customerName", res.data.name);
    });
  }, [leadPhone, form]);

  const checkComeback = (input: { deviceId?: string | null; imei?: string | null; serialNo?: string | null }) =>
    startLookup(async () => {
      const res = await comebackCheckAction(input);
      if (res.ok) setComebacks(res.data);
    });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await intakeAction(form.getValues());
      handleActionResult(form, res);
    }),
  );

  const toggleAccessory = (a: string, on: boolean) =>
    form.setValue("accessories", on ? [...accessories, a] : accessories.filter((x) => x !== a));

  const models = options.models.filter(
    (m) => (!w.brandId || m.brandId === w.brandId) && m.deviceTypeId === w.deviceTypeId,
  );
  const problems = options.problems.filter((p) => !p.deviceTypeId || p.deviceTypeId === w.deviceTypeId);
  const advance = Number(w.advanceAmount || 0) > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-5xl gap-6">
      {lead && (
        <p className="rounded-md bg-lavender px-3 py-2 text-sm text-lavender-foreground">
          Converting the repair enquiry from <strong>{lead.name}</strong>. Opening the job card marks it as won.
        </p>
      )}
      {/* Customer */}
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
          <CardDescription>Look up by phone to reuse the customer and their devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {branches.length > 1 && (
              <SelectField
                control={form.control}
                name="branchId"
                label="Branch"
                options={branches}
                className="sm:col-span-2"
              />
            )}
            <div className="flex items-end gap-2 sm:col-span-2">
              <TextField
                control={form.control}
                name="customerPhone"
                label="Mobile number"
                inputMode="tel"
                autoFocus
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookup();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={lookup} disabled={looking}>
                <SearchIcon /> Find
              </Button>
            </div>
            {found && (
              <div className="flex items-center gap-2 rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground sm:col-span-2">
                <UserCheckIcon className="size-4" /> {found.name}: {found.devices.length} device(s) on record
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label="Not this customer"
                  onClick={() => {
                    setFound(null);
                    form.setValue("customerId", null);
                    form.setValue("deviceId", null);
                  }}
                >
                  <XIcon />
                </Button>
              </div>
            )}
            {!found && found !== undefined && (
              <p className="text-sm text-muted-foreground sm:col-span-2">New customer: enter their details.</p>
            )}
            {!w.customerId && (
              <>
                <TextField control={form.control} name="customerName" label="Name" />
                <TextField control={form.control} name="customerAltPhone" label="Alternate phone" inputMode="tel" />
                <TextField control={form.control} name="customerEmail" label="Email" type="email" />
                <TextField control={form.control} name="customerAddress" label="Address / area" />
              </>
            )}
            <TextField
              control={form.control}
              name="customerGstin"
              label="Customer GSTIN (business customers only)"
              className="sm:col-span-2"
              description="An other-state GSTIN makes the invoice IGST."
            />
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Device */}
      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {found && found.devices.length > 0 && (
              <SelectField
                control={form.control}
                name="deviceId"
                label="Saved device"
                allowNone="A different / new device"
                options={found.devices.map((d) => ({ value: d.id, label: d.label }))}
                className="sm:col-span-2"
                description="Picking a saved device checks for warranty repeat repairs."
              />
            )}
            {usingSavedDevice ? (
              <Button
                type="button"
                variant="outline"
                className="sm:col-span-2"
                onClick={() => checkComeback({ deviceId: w.deviceId })}
                disabled={looking}
              >
                <ShieldCheckIcon /> Check warranty on this device
              </Button>
            ) : (
              <>
                <SelectField
                  control={form.control}
                  name="deviceTypeId"
                  label="Device type"
                  options={options.deviceTypes}
                />
                <SelectField
                  control={form.control}
                  name="brandId"
                  label="Brand"
                  options={options.brands}
                  allowNone="—"
                />
                <SelectField
                  control={form.control}
                  name="modelId"
                  label="Model"
                  options={models}
                  allowNone="Not in list"
                />
                {!w.modelId && <TextField control={form.control} name="modelText" label="Model (type it)" />}
                <TextField
                  control={form.control}
                  name="imei"
                  label="IMEI"
                  inputMode="numeric"
                  onBlur={(e) => e.target.value.trim().length >= 8 && checkComeback({ imei: e.target.value })}
                />
                <TextField
                  control={form.control}
                  name="serialNo"
                  label="Serial number"
                  onBlur={(e) => e.target.value.trim().length >= 4 && checkComeback({ serialNo: e.target.value })}
                />
                <TextField control={form.control} name="color" label="Colour" />
              </>
            )}
            {comebacks.length > 0 && (
              <div className="space-y-2 rounded-md border border-lavender bg-lavender/40 p-3 text-sm sm:col-span-2">
                <p className="font-medium">This device is under warranty from an earlier repair:</p>
                {comebacks.map((c) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={w.parentJobId === c.id}
                      onCheckedChange={(v) => form.setValue("parentJobId", v ? c.id : null)}
                    />
                    <span>
                      <span className="font-mono">{c.jobNo}</span> · {c.problem} · warranty until{" "}
                      {formatDate(c.warrantyUntil)}
                    </span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  Tick it if this is the same fault: labour becomes free (the service manager decides on parts).
                </p>
              </div>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Problem */}
      <Card>
        <CardHeader>
          <CardTitle>Problem & condition</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="problemCategoryId"
              label="Problem category"
              options={problems}
              allowNone="—"
            />
            <TextField
              control={form.control}
              name="unlockCode"
              label="Unlock code / pattern"
              autoComplete="off"
              description="Stored encrypted; wiped on delivery."
            />
            <TextareaField
              control={form.control}
              name="problemReported"
              label="Problem reported by the customer"
              rows={3}
              className="sm:col-span-2"
            />
            <div className="sm:col-span-2">
              <FieldLabel>Accessories received</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...new Set([...ACCESSORIES, ...accessories])].map((a) => {
                  const on = accessories.includes(a);
                  return (
                    <button
                      type="button"
                      key={a}
                      onClick={() => toggleAccessory(a, !on)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                      aria-pressed={on}
                    >
                      {a}
                    </button>
                  );
                })}
                <Input
                  value={customAccessory}
                  onChange={(e) => setCustomAccessory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customAccessory.trim()) {
                      e.preventDefault();
                      toggleAccessory(customAccessory.trim(), true);
                      setCustomAccessory("");
                    }
                  }}
                  placeholder="Other… (Enter)"
                  className="h-8 w-40"
                />
              </div>
            </div>
            <TextareaField
              control={form.control}
              name="conditionNotes"
              label="Physical condition (scratches, dents, cracks…)"
              rows={2}
              className="sm:col-span-2"
              description="You can attach condition photos on the job card after saving."
            />
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Promise & assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Estimate & assignment</CardTitle>
          <CardDescription>
            Repair can start without a quote if the final charges stay within this estimate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="estimatedCost"
              label="Estimated cost (₹, incl. GST)"
              type="number"
              step="1"
              min={0}
            />
            <TextField control={form.control} name="estimatedAt" label="Promised date" type="date" />
            <SelectField
              control={form.control}
              name="priority"
              label="Priority"
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            />
            {engineers.length > 0 && (
              <SelectField
                control={form.control}
                name="assignedEngineerId"
                label="Engineer"
                allowNone="Assign later"
                options={engineers.filter((e) => e.branchIds.includes(branchId))}
              />
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Advance */}
      <Card>
        <CardHeader>
          <CardTitle>Advance (optional)</CardTitle>
          <CardDescription>
            Adjusted against the final invoice; refundable if the customer rejects the quote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="advanceAmount" label="Amount (₹)" type="number" step="1" min={0} />
            {advance && (
              <>
                <SelectField control={form.control} name="advanceModeId" label="Paid by" options={payment.modes} />
                <SelectField
                  control={form.control}
                  name="advanceAccountId"
                  label="Received into"
                  options={payment.accounts.filter((a) => a.branchId === branchId)}
                />
                <TextField control={form.control} name="advanceReference" label="Reference (UPI ref…)" />
              </>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {w.parentJobId && <Badge className="bg-lavender text-lavender-foreground">Warranty repeat job</Badge>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Create job card"}
        </Button>
      </div>
    </form>
  );
}
