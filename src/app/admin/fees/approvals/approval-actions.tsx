"use client";

import { SelectField, TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { decideDiscountAction, decideRefundAction, payRefundAction } from "@/modules/students/students.actions";
import { decisionSchema, payRefundSchema } from "@/modules/students/students.schemas";

type Opt = { value: string; label: string };

export function DecisionButtons({ kind, id, own }: { kind: "discount" | "refund"; id: string; own: boolean }) {
  if (own) return <span className="text-xs text-muted-foreground">Your request: someone else must decide</span>;
  const action = kind === "discount" ? decideDiscountAction : decideRefundAction;
  return (
    <div className="flex gap-2">
      <FormDialog
        trigger={<Button size="sm">Approve</Button>}
        title={`Approve this ${kind}?`}
        description={
          kind === "discount"
            ? "The last unpaid instalments are reduced."
            : "It then appears under 'to pay' for the accounts team."
        }
        schema={decisionSchema}
        defaultValues={{ id, approve: true, note: "" }}
        action={action}
        submitLabel="Approve"
        successMessage="Approved"
      >
        {(form) => <TextField control={form.control} name="note" label="Note (optional)" />}
      </FormDialog>
      <FormDialog
        trigger={
          <Button size="sm" variant="outline">
            Reject
          </Button>
        }
        title={`Reject this ${kind}?`}
        schema={decisionSchema}
        defaultValues={{ id, approve: false, note: "" }}
        action={action}
        submitLabel="Reject"
        destructive
        successMessage="Rejected"
      >
        {(form) => <TextField control={form.control} name="note" label="Reason" />}
      </FormDialog>
    </div>
  );
}

export function PayRefundDialog({
  id,
  amount,
  modes,
  accounts,
}: {
  id: string;
  amount: number;
  modes: Opt[];
  accounts: Opt[];
}) {
  return (
    <FormDialog
      trigger={<Button size="sm">Pay {formatINR(amount)}</Button>}
      title={`Pay refund · ${formatINR(amount)}`}
      schema={payRefundSchema}
      defaultValues={{ id, paymentModeId: modes[0]?.value ?? "", moneyAccountId: accounts[0]?.value ?? "" }}
      action={payRefundAction}
      submitLabel="Mark paid"
      successMessage="Refund paid"
    >
      {(form) => (
        <>
          <SelectField control={form.control} name="paymentModeId" label="Paid by" options={modes} />
          <SelectField control={form.control} name="moneyAccountId" label="Paid from" options={accounts} />
        </>
      )}
    </FormDialog>
  );
}
