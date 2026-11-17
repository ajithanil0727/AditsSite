"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { INDIAN_STATES } from "@/lib/india-states";
import { saveBranchAction } from "@/modules/branches/branches.actions";
import {
  BRANCH_KINDS,
  BRANCH_KIND_LABELS,
  branchSchema,
  type BranchData,
  type BranchInput,
} from "@/modules/branches/branches.schemas";

const EMPTY: BranchInput = {
  code: "",
  name: "",
  kind: "BOTH",
  gstRegistrationId: null,
  stateCode: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  pincode: "",
  phone: "",
  email: "",
  mapUrl: "",
  isActive: true,
  showOnWebsite: true,
  sortOrder: 0,
};

export function BranchFormDialog({
  trigger,
  initial,
  gstOptions,
}: {
  trigger: React.ReactNode;
  initial?: BranchInput;
  gstOptions: { id: string; label: string; stateCode: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<BranchInput, unknown, BranchData>({
    resolver: zodResolver(branchSchema),
    defaultValues: initial ?? EMPTY,
  });
  const stateCode = useWatch({ control: form.control, name: "stateCode" });

  // Validate on the client, but send the raw input: the server validates it again.
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await saveBranchAction(form.getValues());
      if (handleActionResult(form, res, initial ? "Branch updated" : "Branch created")) {
        setOpen(false);
        if (!initial) form.reset(EMPTY);
      }
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(initial ?? EMPTY);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            The branch code is used in document numbers, e.g. <code>KOC/JC/26-27/00001</code>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="code" label="Code" placeholder="KOC" maxLength={4} />
            <TextField control={form.control} name="name" label="Name" placeholder="Kochi" />
            <SelectField
              control={form.control}
              name="kind"
              label="Type"
              options={BRANCH_KINDS.map((k) => ({ value: k, label: BRANCH_KIND_LABELS[k] }))}
            />
            <SelectField
              control={form.control}
              name="stateCode"
              label="State"
              options={INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }))}
            />
            <SelectField
              control={form.control}
              name="gstRegistrationId"
              label="GST registration"
              allowNone="Not registered (non-GST invoices)"
              options={gstOptions
                .filter((g) => !stateCode || g.stateCode === stateCode)
                .map((g) => ({ value: g.id, label: g.label }))}
              className="sm:col-span-2"
            />
            <TextField control={form.control} name="addressLine1" label="Address line 1" className="sm:col-span-2" />
            <TextField control={form.control} name="addressLine2" label="Address line 2" className="sm:col-span-2" />
            <TextField control={form.control} name="city" label="City" />
            <TextField control={form.control} name="pincode" label="PIN code" inputMode="numeric" maxLength={6} />
            <TextField control={form.control} name="phone" label="Phone" inputMode="tel" placeholder="98470 12345" />
            <TextField control={form.control} name="email" label="Email" type="email" />
            <TextField
              control={form.control}
              name="mapUrl"
              label="Google Maps link"
              placeholder="https://maps.google.com/…"
              className="sm:col-span-2"
            />
            <TextField control={form.control} name="sortOrder" label="Sort order" type="number" min={0} />
            <div className="flex flex-col gap-4 sm:col-span-2">
              <SwitchField
                control={form.control}
                name="isActive"
                label="Active"
                description="Inactive branches are hidden from the branch switcher."
              />
              <SwitchField control={form.control} name="showOnWebsite" label="Show on website" />
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
