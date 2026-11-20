"use client";

import Link from "next/link";
import { BriefcaseIcon, PlusIcon, Trash2Icon, UserPlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import {
  addApplicantsAction,
  deleteDriveAction,
  deleteOfferAction,
  saveOfferAction,
  saveRoundAction,
  setApplicationStatusAction,
} from "@/modules/placements/placements.actions";
import type { DriveDetail } from "@/modules/placements/placements.queries";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  JOINING_STATUSES,
  JOINING_STATUS_LABELS,
  offerSchema,
  ROUND_RESULTS,
  ROUND_RESULT_LABELS,
  roundSchema,
} from "@/modules/placements/placements.schemas";

type App = DriveDetail["applications"][number];
const APP_TONE = {
  APPLIED: "sky",
  SHORTLISTED: "lavender",
  IN_PROCESS: "peach",
  SELECTED: "mint",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
} as const;
const ROUND_TONE = { PENDING: "sky", PASSED: "mint", FAILED: "danger", NO_SHOW: "neutral" } as const;

export function AddApplicantsDialog({ driveId, eligible }: { driveId: string; eligible: DriveDetail["eligible"] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const res = await addApplicantsAction({ driveId, enrollmentIds: picked });
      if (res.ok) {
        toast.success(`${res.data.added} student(s) added`);
        setOpen(false);
        setPicked([]);
      } else toast.error(res.error);
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon /> Add students
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Put students forward</DialogTitle>
          <DialogDescription>
            Students of the eligible courses and branch who want placement help and aren&apos;t in this drive yet.
          </DialogDescription>
        </DialogHeader>
        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody else is eligible.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {eligible.map((e) => (
              <li key={e.enrollmentId}>
                <label className="flex cursor-pointer items-center gap-3 p-2.5">
                  <Checkbox
                    checked={picked.includes(e.enrollmentId)}
                    onCheckedChange={(v) =>
                      setPicked((p) => (v === true ? [...p, e.enrollmentId] : p.filter((x) => x !== e.enrollmentId)))
                    }
                    aria-label={`Add ${e.student}`}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{e.student}</span>
                    <span className="block text-xs text-muted-foreground">
                      {e.studentCode} · {e.course} · {e.branchCode} ·{" "}
                      {e.status === "COMPLETED" ? "completed" : "studying"}
                      {e.alreadyPlaced && " · already placed"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || picked.length === 0}>
            {pending ? "Adding…" : `Add ${picked.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusPicker({ a }: { a: App }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={a.status}
      disabled={pending || !a.canManage}
      onValueChange={(status) =>
        start(async () => {
          const res = await setApplicationStatusAction({ id: a.id, status: status as App["status"], notes: a.notes });
          if (res.ok) toast.success("Status updated");
          else toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="h-8 w-36" aria-label={`Status for ${a.student}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {APPLICATION_STATUSES.filter((s) => s !== "SELECTED" || a.offer).map((s) => (
          <SelectItem key={s} value={s}>
            {APPLICATION_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RoundDialog({ a, round, today }: { a: App; round?: App["rounds"][number]; today: string }) {
  return (
    <FormDialog
      trigger={
        round ? (
          <button type="button" className="hover:underline">
            <StatusBadge tone={ROUND_TONE[round.result]}>
              {round.name}: {ROUND_RESULT_LABELS[round.result]}
            </StatusBadge>
          </button>
        ) : (
          <Button size="xs" variant="ghost">
            <PlusIcon /> Round
          </Button>
        )
      }
      title={round ? `Round ${round.roundNo}: ${round.name}` : `Interview round for ${a.student}`}
      description="A failed or missed round marks the student not selected."
      schema={roundSchema}
      defaultValues={{
        id: round?.id,
        applicationId: a.id,
        name: round?.name ?? (a.rounds.length === 0 ? "Technical test" : "HR interview"),
        scheduledAt: round?.scheduledAt ?? today,
        result: round?.result ?? "PENDING",
        remarks: round?.remarks ?? "",
      }}
      action={saveRoundAction}
      successMessage="Round saved"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="name" label="Round" />
          <TextField control={form.control} name="scheduledAt" label="Date" type="date" />
          <SelectField
            control={form.control}
            name="result"
            label="Result"
            options={ROUND_RESULTS.map((r) => ({ value: r, label: ROUND_RESULT_LABELS[r] }))}
          />
          <TextareaField control={form.control} name="remarks" label="Remarks" rows={2} />
        </>
      )}
    </FormDialog>
  );
}

function OfferDialog({ a, today, defaultDesignation }: { a: App; today: string; defaultDesignation: string }) {
  const o = a.offer;
  return (
    <FormDialog
      trigger={
        o ? (
          <button type="button" className="text-left hover:underline">
            <StatusBadge tone={o.joiningStatus === "DECLINED" ? "neutral" : "mint"}>
              {JOINING_STATUS_LABELS[o.joiningStatus]}
            </StatusBadge>
            <span className="ml-1 text-xs text-muted-foreground">
              {o.designation}
              {o.ctcAnnual ? ` · ${formatINR(o.ctcAnnual)}/yr` : ""}
            </span>
          </button>
        ) : (
          <Button size="xs" variant="outline">
            <BriefcaseIcon /> Offer
          </Button>
        )
      }
      title={`Offer for ${a.student}`}
      description="Placed = an offer that wasn't declined. It counts in the placement %."
      schema={offerSchema}
      defaultValues={{
        applicationId: a.id,
        offeredAt: o?.offeredAt ?? today,
        designation: o?.designation ?? defaultDesignation,
        ctcAnnual: o?.ctcAnnual ?? "",
        joiningDate: o?.joiningDate ?? "",
        joiningStatus: o?.joiningStatus ?? "PENDING",
      }}
      action={saveOfferAction}
      successMessage="Offer saved"
    >
      {(form) => (
        <>
          <TextField control={form.control} name="designation" label="Designation" />
          <div className="grid grid-cols-2 gap-3">
            <TextField control={form.control} name="offeredAt" label="Offer date" type="date" />
            <TextField control={form.control} name="ctcAnnual" label="CTC (₹ per year)" type="number" min={0} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              control={form.control}
              name="joiningStatus"
              label="Joining"
              options={JOINING_STATUSES.map((s) => ({ value: s, label: JOINING_STATUS_LABELS[s] }))}
            />
            <TextField control={form.control} name="joiningDate" label="Joining date" type="date" />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function ApplicationsTable({ rows, today, jobRole }: { rows: App[]; today: string; jobRole: string }) {
  if (rows.length === 0)
    return (
      <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">No students put forward yet.</p>
    );
  return (
    <div className="divide-y rounded-xl border">
      {rows.map((a) => (
        <div key={a.id} className="flex flex-wrap items-start gap-3 p-3">
          <div className="min-w-48 flex-1">
            <Link href={`/admin/students/${a.studentId}`} className="font-medium hover:underline">
              {a.student}
            </Link>
            <div className="text-xs text-muted-foreground">
              {a.studentCode} · {a.course} · {a.branchCode} · {a.phone}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {a.rounds.map((r) =>
                a.canManage ? (
                  <RoundDialog key={r.id} a={a} round={r} today={today} />
                ) : (
                  <StatusBadge key={r.id} tone={ROUND_TONE[r.result]}>
                    {r.name}: {ROUND_RESULT_LABELS[r.result]}
                  </StatusBadge>
                ),
              )}
              {a.canManage && !a.offer && a.status !== "REJECTED" && a.status !== "WITHDRAWN" && (
                <RoundDialog a={a} today={today} />
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {a.canManage ? (
              <StatusPicker a={a} />
            ) : (
              <StatusBadge tone={APP_TONE[a.status]}>{APPLICATION_STATUS_LABELS[a.status]}</StatusBadge>
            )}
            {a.canManage && (a.offer || (a.status !== "REJECTED" && a.status !== "WITHDRAWN")) && (
              <OfferDialog a={a} today={today} defaultDesignation={jobRole} />
            )}
            {!a.canManage && a.offer && (
              <StatusBadge tone="mint">{JOINING_STATUS_LABELS[a.offer.joiningStatus]}</StatusBadge>
            )}
            {a.canManage && a.offer && (
              <ConfirmAction
                trigger={
                  <Button size="xs" variant="ghost" aria-label={`Remove offer for ${a.student}`}>
                    <XIcon />
                  </Button>
                }
                title="Remove this offer?"
                description="Use this only for a wrong entry. A declined offer should be marked Declined instead."
                confirmLabel="Remove"
                destructive
                successMessage="Offer removed"
                action={() => deleteOfferAction({ id: a.id })}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeleteDriveButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" className="text-destructive">
          <Trash2Icon /> Delete
        </Button>
      }
      title="Delete this drive?"
      description="Only drives nobody was put forward for can be deleted."
      confirmLabel="Delete"
      destructive
      action={() => deleteDriveAction({ id })}
    />
  );
}
