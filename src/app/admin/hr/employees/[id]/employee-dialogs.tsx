"use client";

import { Loader2Icon, UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { giveAdvanceAction, saveSalaryAction, uploadEmployeeDocAction } from "@/modules/hr/hr.actions";
import {
  advanceSchema,
  salaryStructureSchema,
  type AdvanceInput,
  type SalaryStructureInput,
} from "@/modules/hr/hr.schemas";

type Component = { id: string; name: string; type: "EARNING" | "DEDUCTION" };

function SalaryFields({
  form,
  components,
}: {
  form: UseFormReturn<SalaryStructureInput, unknown, unknown>;
  components: Component[];
}) {
  const { fields } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" }) ?? [];
  const typeOf = (id: string) => components.find((c) => c.id === id)?.type;
  const gross = items
    .filter((i) => typeOf(i.componentId) === "EARNING")
    .reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const ded = items
    .filter((i) => typeOf(i.componentId) === "DEDUCTION")
    .reduce((a, i) => a + (Number(i.amount) || 0), 0);
  return (
    <>
      <TextField
        control={form.control}
        name="effectiveFrom"
        label="From"
        type="date"
        description="Pay from this date's month uses this salary."
      />
      {(["EARNING", "DEDUCTION"] as const).map((type) => (
        <div key={type} className="grid gap-2">
          <span className="text-sm font-medium">
            {type === "EARNING" ? "Earnings (per month)" : "Fixed deductions (per month)"}
          </span>
          {fields.map((f, i) =>
            typeOf(items[i]?.componentId) === type ? (
              <label key={f.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{components.find((c) => c.id === items[i]?.componentId)?.name}</span>
                <Input
                  className="w-32 text-right"
                  type="number"
                  step="1"
                  min={0}
                  aria-label="Amount"
                  {...form.register(`items.${i}.amount`)}
                />
              </label>
            ) : null,
          )}
        </div>
      ))}
      <p className="text-sm">
        Gross <span className="font-medium tabular-nums">{formatINR(gross)}</span>
        {ded > 0 && (
          <span className="text-muted-foreground"> · take-home before loss of pay {formatINR(gross - ded)}</span>
        )}
      </p>
      <TextField control={form.control} name="notes" label="Note" placeholder="Annual increment" />
    </>
  );
}

export function SalaryDialog({
  employeeId,
  components,
  current,
  today,
}: {
  employeeId: string;
  components: Component[];
  current: { componentId: string; amount: number }[];
  today: string;
}) {
  const defaults: SalaryStructureInput = {
    employeeId,
    effectiveFrom: today,
    items: components.map((c) => ({
      componentId: c.id,
      amount: current.find((x) => x.componentId === c.id)?.amount ?? 0,
    })),
    notes: "",
  };
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          {current.length ? "Change salary" : "Set salary"}
        </Button>
      }
      title="Salary"
      description="No PF, ESI, PT or TDS. Earnings are reduced for loss-of-pay days; fixed deductions aren't."
      schema={salaryStructureSchema}
      defaultValues={defaults}
      action={saveSalaryAction}
      successMessage="Salary saved"
    >
      {(form) => <SalaryFields form={form} components={components} />}
    </FormDialog>
  );
}

export function AdvanceDialog({
  employeeId,
  accounts,
  today,
}: {
  employeeId: string;
  accounts: { value: string; label: string }[];
  today: string;
}) {
  const defaults: AdvanceInput = {
    employeeId,
    amount: "" as unknown as number,
    monthlyRecovery: "" as unknown as number,
    givenAt: today,
    moneyAccountId: "",
    note: "",
  };
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          Give advance
        </Button>
      }
      title="Salary advance"
      description="Paid out now (day book) and recovered from salary each month until cleared."
      schema={advanceSchema}
      defaultValues={defaults}
      action={giveAdvanceAction}
      successMessage="Advance recorded"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="amount" label="Amount (₹)" type="number" min={0} step="1" />
          <TextField
            control={form.control}
            name="monthlyRecovery"
            label="Recover per month (₹)"
            type="number"
            min={0}
            step="1"
          />
          <TextField control={form.control} name="givenAt" label="Given on" type="date" />
          <SelectField control={form.control} name="moneyAccountId" label="Paid from" options={accounts} />
          <TextField control={form.control} name="note" label="Note" />
        </>
      )}
    </FormDialog>
  );
}

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Document name (e.g. Aadhaar)"
        className="w-56"
        maxLength={60}
      />
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          fd.set("employeeId", employeeId);
          fd.set("label", label);
          start(async () => {
            const res = await uploadEmployeeDocAction(fd);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Document added");
            setLabel("");
          });
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending || label.trim().length < 2}
        onClick={() => ref.current?.click()}
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Upload
      </Button>
    </div>
  );
}
