"use client";

import {
  ArrowRightLeftIcon,
  BanknoteIcon,
  BadgePercentIcon,
  CheckCircle2Icon,
  LogOutIcon,
  Undo2Icon,
} from "lucide-react";
import { SelectField, TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import {
  collectFeeAction,
  completeAction,
  dropAction,
  requestDiscountAction,
  requestRefundAction,
  transferAction,
  updateStudentAction,
  waiveInstalmentAction,
} from "@/modules/students/students.actions";
import {
  collectFeeSchema,
  completeSchema,
  discountRequestSchema,
  dropSchema,
  refundRequestSchema,
  transferSchema,
  updateStudentSchema,
  waiveSchema,
  type UpdateStudentInput,
} from "@/modules/students/students.schemas";

type Opt = { value: string; label: string };

export function StudentEditDialog({ initial, trigger }: { initial: UpdateStudentInput; trigger: React.ReactNode }) {
  return (
    <FormDialog
      wide
      trigger={trigger}
      title="Edit student"
      schema={updateStudentSchema}
      defaultValues={initial}
      action={updateStudentAction}
      successMessage="Student updated"
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="name" label="Full name" />
          <TextField control={form.control} name="phone" label="Mobile number" inputMode="tel" />
          <TextField control={form.control} name="altPhone" label="Alternate phone" inputMode="tel" />
          <TextField control={form.control} name="email" label="Email" type="email" />
          <TextField control={form.control} name="dob" label="Date of birth" type="date" />
          <SelectField
            control={form.control}
            name="gender"
            label="Gender"
            allowNone="—"
            options={[
              { value: "MALE", label: "Male" },
              { value: "FEMALE", label: "Female" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <TextField control={form.control} name="guardianName" label="Parent / guardian" />
          <TextField control={form.control} name="guardianPhone" label="Guardian phone" inputMode="tel" />
          <TextField control={form.control} name="qualification" label="Qualification" />
          <TextField control={form.control} name="address" label="Address" />
          <TextField control={form.control} name="city" label="City" />
          <div className="grid grid-cols-2 gap-2">
            <TextField control={form.control} name="state" label="State" />
            <TextField control={form.control} name="pincode" label="PIN code" inputMode="numeric" maxLength={6} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function EnrollmentActions({
  enrollmentId,
  status,
  due,
  refundable,
  today,
  branchId,
  batchId,
  courseId,
  payment,
  branches,
  batches,
  instalments,
  can,
}: {
  enrollmentId: string;
  status: string;
  due: number;
  refundable: number;
  today: string;
  branchId: string;
  batchId: string | null;
  courseId: string;
  payment: { modes: Opt[]; accounts: Opt[] };
  branches: Opt[];
  batches: (Opt & { branchId: string; courseId: string })[];
  instalments: { id: string; label: string; due: number; status: string }[];
  can: { collect: boolean; discount: boolean; refund: boolean; waive: boolean; transfer: boolean; update: boolean };
}) {
  const open = status === "ACTIVE" || status === "ON_HOLD";
  const unpaid = instalments.filter((i) => i.status === "DUE" || i.status === "PARTIAL");
  void courseId;
  return (
    <div className="flex flex-wrap gap-2">
      {can.collect && open && due > 0 && (
        <FormDialog
          trigger={
            <Button size="sm">
              <BanknoteIcon /> Collect fee
            </Button>
          }
          title={`Collect fee · ${formatINR(due)} due`}
          description="Settles the oldest unpaid instalment first. A receipt is issued."
          schema={collectFeeSchema}
          defaultValues={{
            enrollmentId,
            amount: String(unpaid[0]?.due ?? due),
            paymentModeId: payment.modes[0]?.value ?? "",
            moneyAccountId: payment.accounts[0]?.value ?? "",
            reference: "",
            paidAt: today,
            notes: "",
          }}
          action={collectFeeAction}
          submitLabel="Save receipt"
          successMessage="Fee collected"
        >
          {(form) => (
            <>
              <div className="grid grid-cols-2 gap-4">
                <TextField control={form.control} name="amount" label="Amount (₹)" type="number" min={0} step="1" />
                <TextField control={form.control} name="paidAt" label="Date" type="date" max={today} />
              </div>
              <SelectField control={form.control} name="paymentModeId" label="Paid by" options={payment.modes} />
              <SelectField
                control={form.control}
                name="moneyAccountId"
                label="Received into"
                options={payment.accounts}
              />
              <TextField control={form.control} name="reference" label="Reference (UPI ref, cheque no.)" />
            </>
          )}
        </FormDialog>
      )}
      {can.discount && open && due > 0 && (
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <BadgePercentIcon /> Discount
            </Button>
          }
          title="Give a discount"
          description="Within your limit it applies now; above it, it goes for approval. It reduces the last unpaid instalments."
          schema={discountRequestSchema}
          defaultValues={{ enrollmentId, amount: "", reason: "" }}
          action={requestDiscountAction}
          submitLabel="Save"
          successMessage="Discount saved"
        >
          {(form) => (
            <>
              <TextField control={form.control} name="amount" label="Amount (₹)" type="number" min={0} step="1" />
              <TextField control={form.control} name="reason" label="Reason" />
            </>
          )}
        </FormDialog>
      )}
      {can.waive && open && unpaid.length > 0 && (
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              Waive instalment
            </Button>
          }
          title="Waive an instalment"
          description="The unpaid part of the instalment is written off. This is logged."
          schema={waiveSchema}
          defaultValues={{ instalmentId: unpaid[0].id, reason: "" }}
          action={waiveInstalmentAction}
          submitLabel="Waive"
          destructive
          successMessage="Instalment waived"
        >
          {(form) => (
            <>
              <SelectField
                control={form.control}
                name="instalmentId"
                label="Instalment"
                options={unpaid.map((i) => ({ value: i.id, label: `${i.label} · ${formatINR(i.due)}` }))}
              />
              <TextField control={form.control} name="reason" label="Reason" />
            </>
          )}
        </FormDialog>
      )}
      {can.refund && refundable > 0 && (
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <Undo2Icon /> Request refund
            </Button>
          }
          title={`Request refund · up to ${formatINR(refundable)}`}
          description="Goes for approval; the money is paid out after it's approved."
          schema={refundRequestSchema}
          defaultValues={{ enrollmentId, amount: "", reason: "" }}
          action={requestRefundAction}
          submitLabel="Request"
          successMessage="Refund requested"
        >
          {(form) => (
            <>
              <TextField control={form.control} name="amount" label="Amount (₹)" type="number" min={0} step="1" />
              <TextField control={form.control} name="reason" label="Reason" />
            </>
          )}
        </FormDialog>
      )}
      {can.transfer && open && (
        <FormDialog
          trigger={
            <Button size="sm" variant="outline">
              <ArrowRightLeftIcon /> Transfer
            </Button>
          }
          title="Transfer to another batch or branch"
          description="Fees already paid stay with this branch; dues still to be paid move to the new branch."
          schema={transferSchema}
          defaultValues={{ enrollmentId, toBranchId: branchId, toBatchId: batchId, reason: "" }}
          action={transferAction}
          submitLabel="Transfer"
          successMessage="Transferred"
        >
          {(form) => (
            <>
              <SelectField control={form.control} name="toBranchId" label="Branch" options={branches} />
              <SelectField
                control={form.control}
                name="toBatchId"
                label="Batch"
                allowNone="No batch yet"
                options={batches}
              />
              <TextField control={form.control} name="reason" label="Reason" />
            </>
          )}
        </FormDialog>
      )}
      {can.update && open && (
        <>
          <FormDialog
            trigger={
              <Button size="sm" variant="outline">
                <CheckCircle2Icon /> Mark completed
              </Button>
            }
            title="Mark the course completed?"
            description={
              due > 0
                ? `${formatINR(due)} is still due; it stays in the dues list.`
                : "Certificates come in a later phase."
            }
            schema={completeSchema}
            defaultValues={{ enrollmentId }}
            action={completeAction}
            submitLabel="Completed"
            successMessage="Marked completed"
          >
            {() => null}
          </FormDialog>
          <FormDialog
            trigger={
              <Button size="sm" variant="ghost" className="text-destructive">
                <LogOutIcon /> Drop out
              </Button>
            }
            title="Student drops out?"
            description={`All unpaid instalments${due > 0 ? ` (${formatINR(due)})` : ""} are waived. Refund any money already paid through 'Request refund'.`}
            schema={dropSchema}
            defaultValues={{ enrollmentId, reason: "" }}
            action={dropAction}
            submitLabel="Drop out"
            destructive
            successMessage="Marked as dropped"
          >
            {(form) => <TextField control={form.control} name="reason" label="Reason" />}
          </FormDialog>
        </>
      )}
    </div>
  );
}
