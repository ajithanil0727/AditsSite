"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from "react-hook-form";
import type { z } from "zod";
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
import type { ActionResult } from "@/modules/rbac/action";
import { handleActionResult } from "./action-helpers";

/**
 * A dialog with a validated form that calls a server action.
 * Sends the raw form values (the server validates again) and closes on success.
 */
export function FormDialog<S extends z.ZodType<unknown, FieldValues>>({
  trigger,
  title,
  description,
  schema,
  defaultValues,
  action,
  submitLabel = "Save",
  successMessage,
  destructive,
  wide,
  children,
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  action: (values: z.input<S>) => Promise<ActionResult<unknown>>;
  submitLabel?: string;
  successMessage?: string;
  destructive?: boolean;
  wide?: boolean;
  children: (form: UseFormReturn<z.input<S>, unknown, z.output<S>>) => React.ReactNode;
  onSuccess?: (data: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues,
  });
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await action(form.getValues());
      if (handleActionResult(form as never, res, successMessage)) {
        setOpen(false);
        onSuccess?.(res.data);
      }
    }),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaultValues);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={wide ? "max-h-[90svh] overflow-y-auto sm:max-w-3xl" : "max-h-[90svh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>{children(form)}</FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
