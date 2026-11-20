"use client";

import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction } from "@/modules/hr/hr.actions";
import type { LeaveRow } from "@/modules/hr/hr.queries";
import { leaveRequestSchema, type LeaveRequestInput } from "@/modules/hr/hr.schemas";

type Opt = { value: string; label: string };
const TONE = { PENDING: "peach", APPROVED: "mint", REJECTED: "danger", CANCELLED: "neutral" } as const;
const LABEL = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" } as const;

export function ApplyLeaveDialog({
  types,
  staff,
  defaultEmployeeId,
  today,
}: {
  types: Opt[];
  staff: Opt[];
  defaultEmployeeId: string | null;
  today: string;
}) {
  const defaults: LeaveRequestInput = {
    employeeId: defaultEmployeeId ?? staff[0]?.value ?? "",
    leaveTypeId: types[0]?.value ?? "",
    fromDate: today,
    toDate: today,
    reason: "",
  };
  return (
    <FormDialog
      trigger={
        <Button>
          <PlusIcon /> Apply for leave
        </Button>
      }
      title="Apply for leave"
      description="Sundays and holidays inside the dates aren't counted."
      schema={leaveRequestSchema}
      defaultValues={defaults}
      action={requestLeaveAction}
      successMessage="Leave request sent"
    >
      {(form) => (
        <>
          {staff.length > 1 && (
            <SelectField control={form.control} name="employeeId" label="Employee" options={staff} />
          )}
          <SelectField control={form.control} name="leaveTypeId" label="Leave type" options={types} />
          <TextField control={form.control} name="fromDate" label="From" type="date" />
          <TextField control={form.control} name="toDate" label="To" type="date" />
          <TextareaField control={form.control} name="reason" label="Reason" rows={2} />
        </>
      )}
    </FormDialog>
  );
}

function Decide({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const go = (approve: boolean) =>
    start(async () => {
      const res = await decideLeaveAction({ id, approve, note: null });
      if (res.ok) toast.success(approve ? "Leave approved" : "Leave rejected");
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

export function LeaveTable({ rows, approver }: { rows: LeaveRow[]; approver: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Leave</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                No leave requests.
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
              <TableCell>
                {r.type}
                {!r.paid && <span className="text-xs text-muted-foreground"> (unpaid)</span>}
                {r.reason && <div className="max-w-xs truncate text-xs text-muted-foreground">{r.reason}</div>}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(r.from)}
                {r.to !== r.from && ` – ${formatDate(r.to)}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.days}</TableCell>
              <TableCell>
                {r.status === "PENDING" && approver && !r.mine ? (
                  <Decide id={r.id} />
                ) : (
                  <StatusBadge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>
                    {LABEL[r.status as keyof typeof LABEL] ?? r.status}
                    {r.decidedBy && r.status !== "PENDING" ? ` · ${r.decidedBy}` : ""}
                  </StatusBadge>
                )}
              </TableCell>
              <TableCell>
                {((r.status === "PENDING" && (r.mine || approver)) || (r.status === "APPROVED" && approver)) && (
                  <ConfirmAction
                    trigger={
                      <Button size="xs" variant="ghost">
                        Cancel
                      </Button>
                    }
                    title="Cancel this leave?"
                    description={
                      r.status === "APPROVED"
                        ? "The days go back to the balance and the leave marks are cleared."
                        : "The request is withdrawn."
                    }
                    confirmLabel="Cancel leave"
                    destructive
                    successMessage="Leave cancelled"
                    action={() => cancelLeaveAction({ id: r.id })}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
