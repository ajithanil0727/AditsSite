"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { handleActionResult } from "@/components/forms/action-helpers";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { NONE, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addLeadActivityAction,
  assignLeadAction,
  changeLeadStatusAction,
  deleteLeadAction,
} from "@/modules/leads/leads.actions";
import {
  ACTIVITY_LABELS,
  activitySchema,
  MANUAL_ACTIVITIES,
  statusChangeSchema,
  type ActivityInput,
  type StatusChangeInput,
} from "@/modules/leads/leads.schemas";

type Status = { value: string; label: string; isWon: boolean; isLost: boolean };

/** Log a call / visit / WhatsApp / note, optionally setting the next follow-up. */
export function ActivityForm({ leadId, nextFollowUp }: { leadId: string; nextFollowUp: string }) {
  const [pending, start] = useTransition();
  const defaults: ActivityInput = { leadId, kind: "CALL", note: "", nextFollowUpAt: "", clearFollowUp: false };
  const form = useForm<ActivityInput>({ resolver: zodResolver(activitySchema) as never, defaultValues: defaults });
  const kind = useWatch({ control: form.control, name: "kind" });
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await addLeadActivityAction(form.getValues());
      if (handleActionResult(form, res, "Saved")) form.reset(defaults);
    }),
  );
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="mb-3 flex flex-wrap gap-1">
        {MANUAL_ACTIVITIES.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => form.setValue("kind", k)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              kind === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {ACTIVITY_LABELS[k]}
          </button>
        ))}
      </div>
      <FieldGroup>
        <TextareaField
          control={form.control}
          name="note"
          label="What happened?"
          rows={2}
          placeholder="Called, interested in weekend batch, will visit Saturday"
        />
        <TextField
          control={form.control}
          name="nextFollowUpAt"
          label="Next follow-up"
          type="datetime-local"
          description={nextFollowUp ? `Currently ${nextFollowUp}. Leave empty to keep it.` : undefined}
        />
      </FieldGroup>
      <Button type="submit" disabled={pending} className="mt-4">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function StatusDialog({
  leadId,
  statuses,
  currentId,
}: {
  leadId: string;
  statuses: Status[];
  currentId: string;
}) {
  const defaults: StatusChangeInput = { leadId, statusId: currentId, lostReason: "", note: "" };
  return (
    <FormDialog
      trigger={<Button variant="outline">Change status</Button>}
      title="Change status"
      schema={statusChangeSchema}
      defaultValues={defaults}
      action={changeLeadStatusAction}
      successMessage="Status updated"
    >
      {(form) => <StatusFields form={form} statuses={statuses} />}
    </FormDialog>
  );
}

function StatusFields({
  form,
  statuses,
}: {
  form: UseFormReturn<StatusChangeInput, unknown, unknown>;
  statuses: Status[];
}) {
  const statusId = useWatch({ control: form.control, name: "statusId" });
  const picked = statuses.find((s) => s.value === statusId);
  return (
    <>
      <SelectField control={form.control} name="statusId" label="Status" options={statuses} />
      {picked?.isWon && (
        <p className="rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground">
          Tip: use Convert instead, so the admission or job card is linked to this enquiry.
        </p>
      )}
      {picked?.isLost && (
        <TextField
          control={form.control}
          name="lostReason"
          label="Why was it lost?"
          placeholder="Joined elsewhere, fee too high…"
        />
      )}
      <TextareaField control={form.control} name="note" label="Note (optional)" rows={2} />
    </>
  );
}

export function AssignSelect({
  leadId,
  current,
  options,
}: {
  leadId: string;
  current: string | null;
  options: { value: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={current ?? NONE}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await assignLeadAction({ leadId, assignedToId: v === NONE ? null : v });
          if (res.ok) toast.success(v === NONE ? "Unassigned" : "Assigned");
          else toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="w-full" aria-label="Counsellor">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DeleteLead({ leadId, deleted }: { leadId: string; deleted: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" className={deleted ? "" : "text-destructive"}>
          {deleted ? "Restore" : "Delete"}
        </Button>
      }
      title={deleted ? "Restore this enquiry?" : "Delete this enquiry?"}
      description={
        deleted
          ? "It will show in the lists again."
          : "Use this for spam or duplicates. It can be restored from the list's deleted view."
      }
      confirmLabel={deleted ? "Restore" : "Delete"}
      destructive={!deleted}
      successMessage={deleted ? "Restored" : "Deleted"}
      action={() => deleteLeadAction({ leadId, restore: deleted })}
    />
  );
}
