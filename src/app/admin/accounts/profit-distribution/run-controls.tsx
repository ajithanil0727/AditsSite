"use client";

import { LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { createRunAction, deleteRunAction, lockRunAction } from "@/modules/accounts/accounts.actions";
import { distributionRunSchema, type DistributionRunInput } from "@/modules/accounts/accounts.schemas";

export function NewRunDialog({ defaults }: { defaults: { from: string; to: string } }) {
  const initial: DistributionRunInput = { periodFrom: defaults.from, periodTo: defaults.to, note: "" };
  return (
    <FormDialog
      trigger={
        <Button>
          <PlusIcon /> Work out a period
        </Button>
      }
      title="Profit distribution"
      description="Works out each branch's profit for the period and each partner's share. It's saved as a draft until you lock it."
      schema={distributionRunSchema}
      defaultValues={initial}
      action={createRunAction}
      submitLabel="Work it out"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="periodFrom" label="From" type="date" />
          <TextField control={form.control} name="periodTo" label="To" type="date" />
          <TextField control={form.control} name="note" label="Note" placeholder="FY 26-27, first half" />
        </>
      )}
    </FormDialog>
  );
}

export function RunActions({ id, canLock, canDelete }: { id: string; canLock: boolean; canDelete: boolean }) {
  return (
    <>
      {canDelete && (
        <ConfirmAction
          trigger={
            <Button variant="ghost" className="text-destructive">
              <Trash2Icon /> Delete draft
            </Button>
          }
          title="Delete this draft?"
          description="You can work out the period again any time."
          confirmLabel="Delete"
          destructive
          action={() => deleteRunAction({ id })}
        />
      )}
      {canLock && (
        <ConfirmAction
          trigger={
            <Button>
              <LockIcon /> Lock
            </Button>
          }
          title="Lock this distribution?"
          description="The figures are frozen and count in each partner's balance. New share changes can't start inside a locked period. This can't be undone."
          confirmLabel="Lock"
          successMessage="Locked"
          action={() => lockRunAction({ id })}
        />
      )}
    </>
  );
}
