"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { TextField } from "@/components/forms/fields";
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
import { resetPasswordAction } from "@/modules/users/users.actions";
import { resetPasswordSchema } from "@/modules/users/users.schemas";

type Values = z.input<typeof resetPasswordSchema>;

export function ResetPasswordDialog({
  userId,
  name,
  trigger,
}: {
  userId: string;
  name: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { id: userId, password: "" },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await resetPasswordAction(form.getValues());
      if (handleActionResult(form, res, "Password changed. The user has been signed out everywhere.")) setOpen(false);
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ id: userId, password: "" });
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {name} and share it with them securely.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <TextField
            control={form.control}
            name="password"
            label="New password"
            type="password"
            autoComplete="new-password"
          />
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
