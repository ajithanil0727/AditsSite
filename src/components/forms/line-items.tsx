"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useFieldArray, type ArrayPath, type Control, type FieldValues, type Path } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PartPicker, type PickerPart } from "./part-picker";

type Extra = { name: "unitCost" | "taxRate"; label: string; step?: string };

/** Editable list of { partId, qty, ...extras } rows inside a react-hook-form. Wraps on small screens. */
export function LineItems<T extends FieldValues, O = T>({
  control,
  name,
  parts,
  extras = [],
  defaults,
  error,
  onPartChosen,
}: {
  control: Control<T, unknown, O>;
  name: ArrayPath<T>;
  parts: PickerPart[];
  extras?: Extra[];
  defaults: Record<string, unknown>;
  error?: string;
  /** e.g. to prefill a price when a part is picked */
  onPartChosen?: (index: number, part: PickerPart) => void;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={f.id} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
          <div className="min-w-[14rem] flex-1">
            <Label className="mb-1 text-xs text-muted-foreground">Part</Label>
            <Controller
              control={control}
              name={`${name}.${i}.partId` as Path<T>}
              render={({ field, fieldState }) => (
                <PartPicker
                  parts={parts}
                  value={(field.value as string) || null}
                  invalid={fieldState.invalid}
                  onChange={(p) => {
                    field.onChange(p.id);
                    onPartChosen?.(i, p);
                  }}
                />
              )}
            />
          </div>
          <div className="w-24">
            <Label className="mb-1 text-xs text-muted-foreground">Qty</Label>
            <Controller
              control={control}
              name={`${name}.${i}.qty` as Path<T>}
              render={({ field, fieldState }) => (
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  aria-label="Quantity"
                  aria-invalid={fieldState.invalid}
                  {...field}
                  value={(field.value as string) ?? ""}
                />
              )}
            />
          </div>
          {extras.map((e) => (
            <div key={e.name} className="w-28">
              <Label className="mb-1 text-xs text-muted-foreground">{e.label}</Label>
              <Controller
                control={control}
                name={`${name}.${i}.${e.name}` as Path<T>}
                render={({ field, fieldState }) => (
                  <Input
                    type="number"
                    step={e.step ?? "0.01"}
                    min={0}
                    aria-label={e.label}
                    aria-invalid={fieldState.invalid}
                    {...field}
                    value={(field.value as string) ?? ""}
                  />
                )}
              />
            </div>
          ))}
          <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => remove(i)}>
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append(defaults as never)}>
        <PlusIcon /> Add part
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
