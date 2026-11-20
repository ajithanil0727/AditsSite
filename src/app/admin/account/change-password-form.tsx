"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { handleActionResult } from "@/components/forms/action-helpers";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { changeOwnPasswordAction } from "@/modules/users/users.actions";
import { changeOwnPasswordSchema, type ChangeOwnPasswordInput } from "@/modules/users/users.schemas";

const EMPTY: ChangeOwnPasswordInput = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function ChangePasswordForm() {
  const [pending, start] = useTransition();
  const form = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: EMPTY,
  });
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await changeOwnPasswordAction(form.getValues());
      if (handleActionResult(form, res, "Password changed")) form.reset(EMPTY);
    }),
  );
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
        />
        <TextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
        />
      </FieldGroup>
      <Button type="submit" disabled={pending} className="mt-6">
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
