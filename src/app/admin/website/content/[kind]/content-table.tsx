"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { CmsFields } from "@/components/cms/cms-fields";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate, formatINR } from "@/lib/format";
import { CONTENT, type ContentKind } from "@/modules/website/content-registry";
import { emptyFor, fieldsSchema, type Option } from "@/modules/website/fields";
import { deleteContentAction, saveContentAction } from "@/modules/website/website.actions";

type Row = Record<string, unknown> & { id: string };

function ContentForm({
  kind,
  initial,
  refOptions,
  trigger,
}: {
  kind: ContentKind;
  initial?: Row;
  refOptions: Record<string, Option[]>;
  trigger: React.ReactNode;
}) {
  const def = CONTENT[kind];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const defaults = initial ?? emptyFor(def.fields);
  const form = useForm<FieldValues>({
    resolver: zodResolver(fieldsSchema(def.fields) as never) as unknown as Resolver<FieldValues>,
    defaultValues: defaults,
  });
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await saveContentAction({
        kind,
        values: { ...form.getValues(), ...(initial ? { id: initial.id } : {}) },
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${def.singular.charAt(0).toUpperCase()}${def.singular.slice(1)} saved. The website is updated.`);
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
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit" : "New"} {def.singular}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <CmsFields fields={def.fields} control={form.control} refOptions={refOptions} />
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

export function ContentTable({
  kind,
  rows,
  refOptions,
  canEdit,
}: {
  kind: ContentKind;
  rows: Row[];
  refOptions: Record<string, Option[]>;
  canEdit: boolean;
}) {
  const def = CONTENT[kind];
  const cell = (name: string, v: unknown) => {
    const f = def.fields.find((x) => x.name === name);
    if (!f) return String(v ?? "");
    if (f.type === "image")
      return v ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${v}`} alt="" className="size-10 rounded-md border object-cover" />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    if (f.type === "switch")
      return v ? <StatusBadge tone="mint">Yes</StatusBadge> : <StatusBadge tone="neutral">No</StatusBadge>;
    if (f.type === "select") return f.options.find((o) => o.value === v)?.label ?? "—";
    if (f.type === "ref") return refOptions[f.name]?.find((o) => o.value === v)?.label ?? "—";
    if (f.type === "date") return v ? formatDate(String(v)) : "—";
    if (f.type === "number" && name === "startingPrice") return v === "" || v === null ? "—" : formatINR(Number(v));
    return v === "" || v === null || v === undefined ? <span className="text-muted-foreground">—</span> : String(v);
  };
  const columns: Column<Row>[] = [
    ...def.columns.map((name, i): Column<Row> => ({
      id: name,
      header: def.fields.find((f) => f.name === name)?.label ?? name,
      meta: { className: i > 1 ? "hidden md:table-cell" : undefined },
      cell: ({ row }) =>
        i === 0 && def.fields.find((f) => f.name === name)?.type !== "image" ? (
          <span className="font-medium">{cell(name, row.original[name])}</span>
        ) : (
          cell(name, row.original[name])
        ),
    })),
    {
      id: "actions",
      header: "",
      meta: { className: "w-24 text-right" },
      cell: ({ row }) =>
        canEdit && (
          <div className="flex justify-end gap-0.5">
            <ContentForm
              kind={kind}
              initial={row.original}
              refOptions={refOptions}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Edit">
                  <PencilIcon />
                </Button>
              }
            />
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Delete">
                  <Trash2Icon />
                </Button>
              }
              title={`Delete this ${def.singular}?`}
              description="It's removed from the website straight away."
              confirmLabel="Delete"
              destructive
              successMessage="Deleted"
              action={() => deleteContentAction({ kind, id: row.original.id })}
            />
          </div>
        ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      total={rows.length}
      page={1}
      pageSize={rows.length || 1}
      paginate={false}
      getRowId={(r) => r.id}
      searchPlaceholder="Search…"
      emptyText={`No ${def.label.toLowerCase()} yet.`}
      toolbar={
        canEdit && (
          <ContentForm
            kind={kind}
            refOptions={refOptions}
            trigger={
              <Button className="ml-auto">
                <PlusIcon /> Add {def.singular}
              </Button>
            }
          />
        )
      }
    />
  );
}
