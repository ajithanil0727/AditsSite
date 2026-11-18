"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveModulesAction } from "@/modules/courses/courses.actions";
import { modulesSchema, type ModulesInput } from "@/modules/courses/courses.schemas";

export function ModulesEditor({
  courseId,
  initial,
  canEdit,
}: {
  courseId: string;
  initial: ModulesInput["modules"];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<ModulesInput, unknown, z.output<typeof modulesSchema>>({
    resolver: zodResolver(modulesSchema),
    defaultValues: { courseId, modules: initial },
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "modules" });

  if (!canEdit) {
    return initial.length ? (
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {initial.map((m, i) => (
          <li key={i}>
            {m.title}
            {m.hours ? <span className="text-muted-foreground"> · {String(m.hours)} h</span> : null}
          </li>
        ))}
      </ol>
    ) : (
      <p className="text-sm text-muted-foreground">No modules yet.</p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(() =>
        startTransition(async () => {
          const res = await saveModulesAction(form.getValues());
          if (handleActionResult(form, res, "Syllabus saved")) form.reset(form.getValues());
        }),
      )}
      className="space-y-2"
    >
      {fields.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2">
          <span className="w-6 text-right text-sm text-muted-foreground">{i + 1}.</span>
          <Controller
            control={form.control}
            name={`modules.${i}.title`}
            render={({ field, fieldState }) => (
              <Input {...field} aria-invalid={fieldState.invalid} placeholder="Module title" className="flex-1" />
            )}
          />
          <Controller
            control={form.control}
            name={`modules.${i}.hours`}
            render={({ field }) => (
              <Input
                {...field}
                value={(field.value as string) ?? ""}
                type="number"
                min={0}
                placeholder="Hours"
                className="w-20"
                aria-label="Hours"
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move up"
            disabled={i === 0}
            onClick={() => move(i, i - 1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move down"
            disabled={i === fields.length - 1}
            onClick={() => move(i, i + 1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => remove(i)}>
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <div className="flex justify-between pt-2">
        <Button type="button" size="sm" variant="outline" onClick={() => append({ title: "", hours: "" })}>
          <PlusIcon /> Add module
        </Button>
        <Button type="submit" size="sm" disabled={pending || !form.formState.isDirty}>
          {pending ? "Saving…" : "Save syllabus"}
        </Button>
      </div>
    </form>
  );
}
