"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, TextField } from "@/components/forms/fields";
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
import type { DocType } from "@/generated/prisma/enums";
import { DOC_TYPE_LABELS, checkFormat } from "@/modules/numbering/format";
import { saveNumberSeriesAction } from "@/modules/settings/settings.actions";
import { numberSeriesSchema, type NumberSeriesInput } from "@/modules/settings/settings.schemas";

type Row = NumberSeriesInput & { docType: DocType; branchCode: string };

export function NumberSeriesDialog({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { docType, branchCode, ...initial } = row;
  const form = useForm<NumberSeriesInput, unknown, z.output<typeof numberSeriesSchema>>({
    resolver: zodResolver(numberSeriesSchema),
    defaultValues: initial,
  });
  const [format, padding] = useWatch({ control: form.control, name: ["format", "padding"] });
  const check = checkFormat({ format: format ?? "", docType, branchCode, padding: Number(padding) || 1 });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await saveNumberSeriesAction(form.getValues());
      if (handleActionResult(form, res, "Number series saved")) setOpen(false);
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(initial);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{DOC_TYPE_LABELS[docType]} numbers</DialogTitle>
          <DialogDescription>Changes apply to the next document created.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <TextField control={form.control} name="format" label="Format" className="font-mono" />
            <div className="grid grid-cols-2 gap-4">
              <TextField control={form.control} name="padding" label="Digits" type="number" min={1} max={8} />
              <TextField
                control={form.control}
                name="nextNumber"
                label="Next number"
                type="number"
                min={initial.nextNumber as number}
                description="Can only go up."
              />
            </div>
            <SelectField
              control={form.control}
              name="resetPolicy"
              label="Reset"
              options={[
                { value: "FINANCIAL_YEAR", label: "Every financial year (1 April)" },
                { value: "NEVER", label: "Never" },
              ]}
            />
            <div
              className={`rounded-md px-3 py-2 text-sm ${check.ok ? "bg-mint text-mint-foreground" : "bg-destructive/10 text-destructive"}`}
              role="status"
            >
              {check.ok ? (
                <>
                  Longest number: <span className="font-mono">{check.example}</span>
                </>
              ) : (
                check.error
              )}
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !check.ok}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
