"use client";

import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/format";
import { addIncentiveAction, decideIncentiveAction } from "@/modules/hr/hr.actions";
import type { IncentiveRow } from "@/modules/hr/hr.queries";
import { incentiveSchema, MONTHS, type IncentiveInput } from "@/modules/hr/hr.schemas";

const TONE = { PENDING: "peach", APPROVED: "mint", REJECTED: "danger", CANCELLED: "neutral" } as const;

export function AddIncentiveDialog({
  staff,
  defaults,
}: {
  staff: { value: string; label: string }[];
  defaults: { year: number; month: number };
}) {
  const initial: IncentiveInput = {
    employeeId: staff[0]?.value ?? "",
    year: defaults.year,
    month: defaults.month,
    amount: "" as unknown as number,
    reason: "",
  };
  return (
    <FormDialog
      trigger={
        <Button>
          <PlusIcon /> Add incentive
        </Button>
      }
      title="Incentive"
      description="Paid with that month's salary once someone else approves it."
      schema={incentiveSchema}
      defaultValues={initial}
      action={addIncentiveAction}
      successMessage="Incentive added. Waiting for approval."
    >
      {(form) => (
        <>
          <SelectField control={form.control} name="employeeId" label="Employee" options={staff} />
          <SelectField
            control={form.control}
            name="month"
            label="Salary month"
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <TextField control={form.control} name="year" label="Year" type="number" />
          <TextField control={form.control} name="amount" label="Amount (₹)" type="number" min={0} step="1" />
          <TextField control={form.control} name="reason" label="For" placeholder="12 admissions in November" />
        </>
      )}
    </FormDialog>
  );
}

function Decide({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const go = (approve: boolean) =>
    start(async () => {
      const res = await decideIncentiveAction({ id, approve, note: null });
      if (res.ok) toast.success(approve ? "Approved" : "Rejected");
      else toast.error(res.error);
    });
  return (
    <div className="flex gap-1">
      <Button size="xs" variant="outline" disabled={pending} onClick={() => go(true)}>
        <CheckIcon /> Approve
      </Button>
      <Button size="xs" variant="ghost" disabled={pending} aria-label="Reject" onClick={() => go(false)}>
        <XIcon />
      </Button>
    </div>
  );
}

export function IncentivesTable({ rows, canApprove }: { rows: IncentiveRow[]; canApprove: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Month</TableHead>
            <TableHead>For</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                No incentives yet.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.employee}</div>
                <div className="text-xs text-muted-foreground">
                  {r.code} · {r.branchCode}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {MONTHS[r.month - 1]} {r.year}
              </TableCell>
              <TableCell>{r.reason}</TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(r.amount)}</TableCell>
              <TableCell>
                {canApprove && r.canDecide ? (
                  <Decide id={r.id} />
                ) : (
                  <StatusBadge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>
                    {r.paid ? "Paid in salary" : r.status === "PENDING" ? "Waiting" : r.status.toLowerCase()}
                  </StatusBadge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
