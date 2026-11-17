"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { createRoleAction } from "@/modules/roles/roles.actions";
import { createRoleSchema, type CreateRoleInput } from "@/modules/roles/roles.schemas";

export function CreateRoleDialog({
  trigger,
  roles,
}: {
  trigger: React.ReactNode;
  roles: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<CreateRoleInput, unknown, z.output<typeof createRoleSchema>>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { name: "", description: "", copyFromRoleId: null },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      // On success the action redirects to the permission matrix.
      const res = await createRoleAction(form.getValues());
      handleActionResult(form, res);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <TextField control={form.control} name="name" label="Name" />
            <TextField control={form.control} name="description" label="Description" />
            <SelectField
              control={form.control}
              name="copyFromRoleId"
              label="Start from"
              allowNone="No permissions"
              options={roles.map((r) => ({ value: r.id, label: `Copy of ${r.name}` }))}
            />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create and edit permissions"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
