"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/modules/rbac/action";

/**
 * Apply a server action result to a form: field errors go to their inputs,
 * other errors become a toast. Returns true on success.
 */
export function handleActionResult<T extends FieldValues, R>(
  form: UseFormReturn<T, unknown, unknown> | UseFormReturn<T, unknown, T> | null,
  result: ActionResult<R>,
  successMessage?: string,
): result is { ok: true; data: R } {
  if (result.ok) {
    if (successMessage) toast.success(successMessage);
    return true;
  }
  if (result.fieldErrors && form) {
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      if (messages?.[0]) form.setError(field as Path<T>, { message: messages[0] });
    }
  }
  toast.error(result.error);
  return false;
}
