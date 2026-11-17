"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { stateName } from "@/lib/india-states";
import { saveGstRegistrationAction } from "@/modules/settings/settings.actions";
import { gstRegistrationSchema, type GstRegistrationInput } from "@/modules/settings/settings.schemas";

const EMPTY: GstRegistrationInput = {
  gstin: "",
  legalName: "",
  tradeName: "",
  stateName: "",
  address: "",
  isActive: true,
};

export function GstFormDialog({ trigger, initial }: { trigger: React.ReactNode; initial?: GstRegistrationInput }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<GstRegistrationInput, unknown, z.output<typeof gstRegistrationSchema>>({
    resolver: zodResolver(gstRegistrationSchema),
    defaultValues: initial ?? EMPTY,
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await saveGstRegistrationAction(form.getValues());
      if (handleActionResult(form, res, "GST registration saved")) setOpen(false);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit GST registration" : "Add GST registration"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <TextField
              control={form.control}
              name="gstin"
              label="GSTIN"
              placeholder="32AAKFC1234M1ZP"
              maxLength={15}
              className="font-mono"
              onBlur={(e) => {
                const name = stateName(e.target.value.slice(0, 2));
                if (name && !form.getValues("stateName")) form.setValue("stateName", name);
              }}
            />
            <TextField control={form.control} name="legalName" label="Legal name" />
            <TextField control={form.control} name="tradeName" label="Trade name" />
            <TextField
              control={form.control}
              name="stateName"
              label="State"
              description="Filled from the first two digits of the GSTIN."
            />
            <TextareaField control={form.control} name="address" label="Registered address" rows={3} />
            <SwitchField control={form.control} name="isActive" label="Active" />
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
