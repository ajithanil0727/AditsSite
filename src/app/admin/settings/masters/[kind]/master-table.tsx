"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { handleActionResult } from "@/components/forms/action-helpers";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { saveMasterAction } from "@/modules/masters/masters.actions";
import { MASTERS, emptyValues, masterSchema, type MasterKind, type Option } from "@/modules/masters/registry";

type Row = Record<string, unknown>;
type Values = Record<string, unknown>;

function MasterForm({
  kind,
  initial,
  options,
  trigger,
}: {
  kind: MasterKind;
  initial?: Values;
  options: Record<string, Option[]>;
  trigger: React.ReactNode;
}) {
  const def = MASTERS[kind];
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults = initial ?? emptyValues(def);
  const form = useForm<Values>({
    resolver: zodResolver(masterSchema(def)) as Resolver<Values>,
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const res = await saveMasterAction({ kind, values: form.getValues() });
      if (handleActionResult(form, res, `${def.singular.charAt(0).toUpperCase()}${def.singular.slice(1)} saved`))
        setOpen(false);
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit" : "New"} {def.singular}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {def.fields.map((f) => {
              if (f.type === "switch")
                return (
                  <SwitchField key={f.name} control={form.control} name={f.name} label={f.label} description={f.help} />
                );
              if (f.type === "select" || f.type === "ref")
                return (
                  <SelectField
                    key={f.name}
                    control={form.control}
                    name={f.name}
                    label={f.label}
                    description={f.help}
                    options={f.type === "select" ? f.options : (options[f.name] ?? [])}
                    allowNone={f.required ? undefined : "—"}
                  />
                );
              return (
                <TextField
                  key={f.name}
                  control={form.control}
                  name={f.name}
                  label={f.label}
                  description={f.help}
                  type={f.type === "number" ? "number" : "text"}
                  step={f.type === "number" ? (f.step ?? 1) : undefined}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                />
              );
            })}
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

export function MasterTable({
  kind,
  rows,
  options,
}: {
  kind: MasterKind;
  rows: Row[];
  options: Record<string, Option[]>;
}) {
  const def = MASTERS[kind];
  const label = (field: string, value: unknown) => {
    const f = def.fields.find((x) => x.name === field);
    if (!f) return String(value ?? "");
    if (f.type === "switch")
      return value ? (
        <Badge className="bg-mint text-mint-foreground">Yes</Badge>
      ) : (
        <span className="text-muted-foreground">No</span>
      );
    if (f.type === "ref") return options[f.name]?.find((o) => o.value === value)?.label ?? "—";
    if (f.type === "select") return f.options.find((o) => o.value === value)?.label ?? "—";
    return value === null || value === undefined || value === "" ? "—" : String(value);
  };

  const toForm = (row: Row): Values => {
    const v: Values = { id: row.id };
    for (const f of def.fields) {
      const raw = row[f.name];
      v[f.name] =
        f.type === "number"
          ? (raw ?? "")
          : f.type === "text"
            ? (raw ?? "")
            : (raw ?? (f.type === "switch" ? false : null));
    }
    return v;
  };

  const columns: Column<Row>[] = [
    ...def.columns.map((c, i): Column<Row> => ({
      id: c,
      header: def.fields.find((f) => f.name === c)?.label ?? c,
      meta: i > 1 ? { className: "hidden md:table-cell" } : undefined,
      cell: ({ row }) =>
        i === 0 ? <span className="font-medium">{label(c, row.original[c])}</span> : label(c, row.original[c]),
    })),
    {
      id: "edit",
      header: () => <span className="sr-only">Edit</span>,
      meta: { className: "w-12 text-right" },
      cell: ({ row }) => (
        <MasterForm
          kind={kind}
          initial={toForm(row.original)}
          options={options}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit">
              <PencilIcon />
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      total={rows.length}
      page={1}
      pageSize={Math.max(rows.length, 10)}
      paginate={false}
      getRowId={(r) => String(r.id)}
      searchPlaceholder={`Search ${def.label.toLowerCase()}…`}
      emptyText={`No ${def.label.toLowerCase()} yet.`}
      toolbar={
        <MasterForm
          kind={kind}
          options={options}
          trigger={
            <Button>
              <PlusIcon /> New {def.singular}
            </Button>
          }
        />
      }
    />
  );
}
