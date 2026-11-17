"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SwitchField, TextField } from "@/components/forms/fields";
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
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveUserAction } from "@/modules/users/users.actions";
import { ROLE_SCOPES, SCOPE_LABELS, userSchema, type UserData, type UserInput } from "@/modules/users/users.schemas";

export type UserFormOptions = {
  roles: { id: string; name: string; grantable: boolean }[];
  branches: { id: string; label: string }[];
};

const EMPTY: UserInput = {
  name: "",
  email: "",
  phone: "",
  password: "",
  isActive: true,
  roles: [],
  branchIds: [],
};

export function UserFormDialog({
  trigger,
  initial,
  options,
}: {
  trigger: React.ReactNode;
  initial?: UserInput;
  options: UserFormOptions;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<UserInput, unknown, UserData>({
    resolver: zodResolver(userSchema),
    defaultValues: initial ?? EMPTY,
  });
  const roles = useFieldArray({ control: form.control, name: "roles" });
  const chosenRoles = useWatch({ control: form.control, name: "roles" });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await saveUserAction(form.getValues());
      if (handleActionResult(form, res, initial ? "User updated" : "User created")) setOpen(false);
    }),
  );

  const roleName = (id: string) => options.roles.find((r) => r.id === id)?.name ?? "Unknown role";

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
          <DialogTitle>{initial ? "Edit user" : "New user"}</DialogTitle>
          <DialogDescription>Roles decide what the user can do; the scope decides which records.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Full name" />
              <TextField control={form.control} name="email" label="Email (login)" type="email" autoComplete="off" />
              <TextField control={form.control} name="phone" label="Phone" inputMode="tel" />
              <TextField
                control={form.control}
                name="password"
                label={initial ? "New password (optional)" : "Password"}
                type="password"
                autoComplete="new-password"
                description="At least 8 characters with a letter and a number."
              />
            </div>

            <FieldSet>
              <FieldLegend variant="label">Roles</FieldLegend>
              <div className="space-y-2">
                {roles.fields.map((f, i) => (
                  <div key={f.id} className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center">
                    <span className="flex-1 text-sm font-medium">{roleName(f.roleId)}</span>
                    <Controller
                      control={form.control}
                      name={`roles.${i}.scope`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full sm:w-48" aria-label="Scope">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_SCOPES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {SCOPE_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove role"
                      onClick={() => roles.remove(i)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
                <Select value="" onValueChange={(roleId) => roles.append({ roleId, scope: "ASSIGNED_BRANCHES" })}>
                  <SelectTrigger className="w-full sm:w-64" aria-label="Add role">
                    <PlusIcon className="size-4" />
                    <SelectValue placeholder="Add a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.roles
                      .filter((r) => !chosenRoles.some((x) => x.roleId === r.id))
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id} disabled={!r.grantable}>
                          {r.name}
                          {!r.grantable && " (beyond your access)"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[form.formState.errors.roles?.root ?? form.formState.errors.roles]} />
              </div>
            </FieldSet>

            <Controller
              control={form.control}
              name="branchIds"
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Branches</FieldLegend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.branches.map((b) => {
                      const checked = field.value.includes(b.id);
                      return (
                        <Field key={b.id} orientation="horizontal">
                          <Checkbox
                            id={`branch-${b.id}`}
                            checked={checked}
                            onCheckedChange={(v) =>
                              field.onChange(v ? [...field.value, b.id] : field.value.filter((id) => id !== b.id))
                            }
                          />
                          <FieldLabel htmlFor={`branch-${b.id}`} className="font-normal">
                            {b.label}
                          </FieldLabel>
                        </Field>
                      );
                    })}
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </FieldSet>
              )}
            />

            <SwitchField
              control={form.control}
              name="isActive"
              label="Active"
              description="Inactive users can't sign in. Their current sessions end."
            />
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
