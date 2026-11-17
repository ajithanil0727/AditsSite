"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Base<T extends FieldValues, O = T> = {
  control: Control<T, unknown, O>;
  name: Path<T>;
  label: string;
  description?: string;
  className?: string;
};

export function TextField<T extends FieldValues, O = T>({
  control,
  name,
  label,
  description,
  className,
  ...input
}: Base<T, O> & Omit<React.ComponentProps<typeof Input>, "name">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input id={name} aria-invalid={fieldState.invalid} {...input} {...field} value={field.value ?? ""} />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues, O = T>({
  control,
  name,
  label,
  description,
  className,
  ...input
}: Base<T, O> & Omit<React.ComponentProps<typeof Textarea>, "name">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Textarea id={name} aria-invalid={fieldState.invalid} {...input} {...field} value={field.value ?? ""} />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export const NONE = "__none";

export function SelectField<T extends FieldValues, O = T>({
  control,
  name,
  label,
  description,
  className,
  options,
  placeholder = "Select…",
  allowNone,
}: Base<T, O> & {
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Adds an empty choice that maps to null. */
  allowNone?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select
            value={field.value ?? (allowNone ? NONE : "")}
            onValueChange={(v) => field.onChange(v === NONE ? null : v)}
          >
            <SelectTrigger id={name} aria-invalid={fieldState.invalid} className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowNone && <SelectItem value={NONE}>{allowNone}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues, O = T>({
  control,
  name,
  label,
  description,
  className,
}: Base<T, O>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className={className}>
          <FieldContent>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
          </FieldContent>
          <Switch id={name} checked={!!field.value} onCheckedChange={field.onChange} />
        </Field>
      )}
    />
  );
}
