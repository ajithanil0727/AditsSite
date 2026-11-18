"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useFieldArray, type Control, type FieldValues } from "react-hook-form";
import { ImagePicker } from "@/components/cms/media-library";
import { MarkdownEditor } from "@/components/cms/markdown-editor";
import { NONE } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { emptyFor, type CmsField, type Option } from "@/modules/website/fields";

type Ctl = Control<FieldValues>;

/** Renders an editor for a list of CMS field descriptors (sections, content lists). */
export function CmsFields({
  fields,
  control,
  prefix = "",
  refOptions = {},
}: {
  fields: CmsField[];
  control: Ctl;
  prefix?: string;
  refOptions?: Record<string, Option[]>;
}) {
  return (
    <FieldGroup>
      {fields.map((f) => (
        <CmsFieldControl key={f.name} field={f} control={control} name={`${prefix}${f.name}`} refOptions={refOptions} />
      ))}
    </FieldGroup>
  );
}

function CmsFieldControl({
  field: f,
  control,
  name,
  refOptions,
}: {
  field: CmsField;
  control: Ctl;
  name: string;
  refOptions: Record<string, Option[]>;
}) {
  if (f.type === "list") return <ListField field={f} control={control} name={name} refOptions={refOptions} />;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = fieldState.invalid;
        const label = (
          <FieldLabel htmlFor={name}>
            {f.label}
            {f.required && <span className="text-destructive"> *</span>}
          </FieldLabel>
        );
        const help = f.help && <FieldDescription>{f.help}</FieldDescription>;
        const error = <FieldError errors={[fieldState.error]} />;
        switch (f.type) {
          case "switch":
            return (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={name}>{f.label}</FieldLabel>
                  {help}
                </FieldContent>
                <Switch id={name} checked={!!field.value} onCheckedChange={field.onChange} />
              </Field>
            );
          case "select":
          case "ref": {
            const options = f.type === "select" ? f.options : (refOptions[f.name] ?? []);
            return (
              <Field data-invalid={invalid}>
                {label}
                <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                  <SelectTrigger id={name} className="w-full" aria-invalid={invalid}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {!f.required && <SelectItem value={NONE}>—</SelectItem>}
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {help}
                {error}
              </Field>
            );
          }
          case "image":
            return (
              <Field data-invalid={invalid}>
                {label}
                <ImagePicker
                  id={name}
                  value={field.value}
                  onChange={field.onChange}
                  aspect={f.aspect}
                  invalid={invalid}
                />
                {help}
                {error}
              </Field>
            );
          case "markdown":
            return (
              <Field data-invalid={invalid}>
                {label}
                <MarkdownEditor id={name} value={field.value ?? ""} onChange={field.onChange} invalid={invalid} />
                {help ?? <FieldDescription>Use the toolbar for headings, lists and links.</FieldDescription>}
                {error}
              </Field>
            );
          case "textarea":
            return (
              <Field data-invalid={invalid}>
                {label}
                <Textarea
                  id={name}
                  rows={f.rows ?? 3}
                  maxLength={f.max}
                  aria-invalid={invalid}
                  {...field}
                  value={field.value ?? ""}
                />
                {help}
                {error}
              </Field>
            );
          case "link":
            return (
              <Field data-invalid={invalid}>
                {label}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    id={name}
                    aria-label={`${f.label} label`}
                    placeholder="Button text"
                    maxLength={60}
                    value={field.value?.label ?? ""}
                    onChange={(e) => field.onChange({ ...(field.value ?? {}), label: e.target.value })}
                  />
                  <Input
                    aria-label={`${f.label} link`}
                    placeholder="/enquire or https://…"
                    value={field.value?.href ?? ""}
                    onChange={(e) => field.onChange({ ...(field.value ?? {}), href: e.target.value })}
                  />
                </div>
                {help}
                {error}
              </Field>
            );
          default:
            return (
              <Field data-invalid={invalid}>
                {label}
                <Input
                  id={name}
                  aria-invalid={invalid}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                  step={f.type === "number" ? (f.step ?? 1) : undefined}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  maxLength={f.type === "text" ? f.max : undefined}
                  placeholder={f.type === "text" || f.type === "url" ? f.placeholder : undefined}
                  {...field}
                  value={field.value ?? ""}
                />
                {help}
                {error}
              </Field>
            );
        }
      }}
    />
  );
}

function ListField({
  field: f,
  control,
  name,
  refOptions,
}: {
  field: Extract<CmsField, { type: "list" }>;
  control: Ctl;
  name: string;
  refOptions: Record<string, Option[]>;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name });
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{f.label}</span>
        <span className="text-xs text-muted-foreground">
          {fields.length} / {f.max}
        </span>
      </div>
      {fields.map((item, i) => (
        <div key={item.id} className={cn("rounded-lg border bg-muted/30 p-3")}>
          <div className="mb-2 flex items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {f.itemLabel} {i + 1}
            </span>
            <div className="ml-auto flex gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Move down"
                disabled={i === fields.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => remove(i)}>
                <Trash2Icon />
              </Button>
            </div>
          </div>
          <CmsFields fields={f.fields} control={control} prefix={`${name}.${i}.`} refOptions={refOptions} />
        </div>
      ))}
      {fields.length < f.max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => append(emptyFor(f.fields))}
        >
          <PlusIcon /> Add {f.itemLabel.toLowerCase()}
        </Button>
      )}
    </div>
  );
}
