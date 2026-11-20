"use client";

import { CheckCircle2Icon, PlusIcon, RefreshCwIcon, Trash2Icon, WalletIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  buildPayrollAction,
  deletePayrollAction,
  finalizePayrollAction,
  payPayrollAction,
} from "@/modules/hr/hr.actions";
import {
  MONTHS,
  payrollPaySchema,
  payrollRunSchema,
  type PayrollPayInput,
  type PayrollRunInput,
} from "@/modules/hr/hr.schemas";

type Opt = { value: string; label: string };

export function NewPayrollDialog({
  branches,
  defaults,
}: {
  branches: Opt[];
  defaults: { year: number; month: number };
}) {
  const initial: PayrollRunInput = { branchId: branches[0]?.value ?? "", year: defaults.year, month: defaults.month };
  return (
    <FormDialog
      trigger={
        <Button>
          <PlusIcon /> Work out payroll
        </Button>
      }
      title="Payroll"
      description="Works out every employee's pay for the month from attendance, leave, salary, incentives and advances. It stays a draft until you finalise it."
      schema={payrollRunSchema}
      defaultValues={initial}
      action={buildPayrollAction}
      submitLabel="Work it out"
    >
      {(form) => (
        <>
          <SelectField control={form.control} name="branchId" label="Branch" options={branches} />
          <SelectField
            control={form.control}
            name="month"
            label="Month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <TextField control={form.control} name="year" label="Year" type="number" min={2020} />
        </>
      )}
    </FormDialog>
  );
}

export function RunActions({
  run,
  perms,
  accounts,
  today,
}: {
  run: { id: string; branchId: string; year: number; month: number; status: string; unmarked: number };
  perms: { run: boolean; finalize: boolean; pay: boolean };
  accounts: Opt[];
  today: string;
}) {
  const [pending, start] = useTransition();
  const draft = run.status === "DRAFT";
  const payDefaults: PayrollPayInput = { runId: run.id, moneyAccountId: "", paidOn: today };
  return (
    <>
      {draft && perms.run && (
        <>
          <ConfirmAction
            trigger={
              <Button variant="ghost" className="text-destructive">
                <Trash2Icon /> Delete draft
              </Button>
            }
            title="Delete this draft payroll?"
            description="You can work it out again any time."
            confirmLabel="Delete"
            destructive
            action={() => deletePayrollAction({ id: run.id })}
          />
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await buildPayrollAction({ branchId: run.branchId, year: run.year, month: run.month });
                if (res && !res.ok) toast.error(res.error);
              })
            }
          >
            <RefreshCwIcon /> Work out again
          </Button>
        </>
      )}
      {draft && perms.finalize && (
        <ConfirmAction
          trigger={
            <Button>
              <CheckCircle2Icon /> Finalise
            </Button>
          }
          title="Finalise this payroll?"
          description={`${run.unmarked ? `${run.unmarked} working day(s) weren't marked and were counted as present. ` : ""}Finalising locks the month's attendance and leave, ties incentives to these payslips and recovers advances. The salary cost shows in the P&L for ${MONTHS[run.month - 1]}.`}
          confirmLabel="Finalise"
          successMessage="Payroll finalised"
          action={() => finalizePayrollAction({ id: run.id })}
        />
      )}
      {run.status === "FINALIZED" && perms.pay && (
        <FormDialog
          trigger={
            <Button>
              <WalletIcon /> Mark paid
            </Button>
          }
          title="Pay salaries"
          description="Records each person's net pay going out of the account (day book)."
          schema={payrollPaySchema}
          defaultValues={payDefaults}
          action={payPayrollAction}
          successMessage="Salaries marked paid"
        >
          {(form) => (
            <>
              <SelectField control={form.control} name="moneyAccountId" label="Paid from" options={accounts} />
              <TextField control={form.control} name="paidOn" label="Paid on" type="date" />
            </>
          )}
        </FormDialog>
      )}
    </>
  );
}
