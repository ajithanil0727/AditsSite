"use client";

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { menuItemSchema, type MenuItemInput } from "@/modules/website/site-settings";
import { deleteMenuItemAction, moveMenuItemAction, saveMenuItemAction } from "@/modules/website/website.actions";

type Item = {
  id: string;
  location: "HEADER" | "FOOTER";
  label: string;
  parentId: string | null;
  pageId: string | null;
  url: string;
  target: string;
  pageDraft: boolean;
  isVisible: boolean;
  openInNewTab: boolean;
};
type Option = { value: string; label: string };

function ItemDialog({
  trigger,
  initial,
  pages,
  parents,
}: {
  trigger: React.ReactNode;
  initial: MenuItemInput;
  pages: Option[];
  parents: Option[];
}) {
  return (
    <FormDialog
      trigger={trigger}
      title={initial.id ? "Edit link" : "Add link"}
      schema={menuItemSchema}
      defaultValues={initial}
      action={saveMenuItemAction}
      successMessage="Menu saved"
    >
      {(form) => <ItemFields form={form} pages={pages} parents={parents} />}
    </FormDialog>
  );
}

function ItemFields({
  form,
  pages,
  parents,
}: {
  form: Parameters<Parameters<typeof FormDialog<typeof menuItemSchema>>[0]["children"]>[0];
  pages: Option[];
  parents: Option[];
}) {
  const pageId = useWatch({ control: form.control, name: "pageId" });
  return (
    <>
      <TextField control={form.control} name="label" label="Label" maxLength={40} />
      <SelectField control={form.control} name="pageId" label="Page" options={pages} allowNone="Custom link" />
      {!pageId && <TextField control={form.control} name="url" label="Link" placeholder="/track or https://…" />}
      {parents.length > 0 && (
        <SelectField
          control={form.control}
          name="parentId"
          label="Show inside"
          options={parents}
          allowNone="Top level"
        />
      )}
      <SwitchField control={form.control} name="isVisible" label="Visible" />
      {!pageId && <SwitchField control={form.control} name="openInNewTab" label="Open in a new tab" />}
    </>
  );
}

function MenuCard({ location, items, pages }: { location: "HEADER" | "FOOTER"; items: Item[]; pages: Option[] }) {
  const [pending, start] = useTransition();
  const mine = items.filter((i) => i.location === location);
  const top = mine.filter((i) => !i.parentId);
  const parents = top.map((t) => ({ value: t.id, label: t.label }));
  const move = (id: string, direction: "up" | "down") =>
    start(async () => {
      const res = await moveMenuItemAction({ id, direction });
      if (!res.ok) toast.error(res.error);
    });
  const row = (i: Item, idx: number, siblings: Item[], child = false) => (
    <div
      key={i.id}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card p-2.5",
        child && "ml-8",
        !i.isVisible && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{i.label}</span>
          {!i.isVisible && <StatusBadge tone="neutral">Hidden</StatusBadge>}
          {i.pageDraft && <StatusBadge tone="peach">Page not published</StatusBadge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{i.target}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Move up"
        disabled={idx === 0 || pending}
        onClick={() => move(i.id, "up")}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Move down"
        disabled={idx === siblings.length - 1 || pending}
        onClick={() => move(i.id, "down")}
      >
        <ArrowDownIcon />
      </Button>
      <ItemDialog
        pages={pages}
        parents={parents.filter((p) => p.value !== i.id)}
        initial={{
          id: i.id,
          location: i.location,
          label: i.label,
          pageId: i.pageId,
          url: i.url,
          parentId: i.parentId,
          isVisible: i.isVisible,
          openInNewTab: i.openInNewTab,
        }}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${i.label}`}>
            <PencilIcon />
          </Button>
        }
      />
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${i.label}`}>
            <Trash2Icon />
          </Button>
        }
        title={`Remove "${i.label}"?`}
        description={
          child ? "The link is removed from the menu." : "The link and anything inside it are removed from the menu."
        }
        confirmLabel="Remove"
        destructive
        action={() => deleteMenuItemAction({ id: i.id })}
      />
    </div>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{location === "HEADER" ? "Header menu" : "Footer menu"}</CardTitle>
        <ItemDialog
          pages={pages}
          parents={location === "HEADER" ? parents : []}
          initial={{ location, label: "", pageId: null, url: "", parentId: null, isVisible: true, openInNewTab: false }}
          trigger={
            <Button size="sm" variant="outline">
              <PlusIcon /> Add link
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="grid gap-2">
        {top.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
        {top.map((t, idx) => {
          const children = mine.filter((c) => c.parentId === t.id);
          return (
            <div key={t.id} className="grid gap-2">
              {row(t, idx, top)}
              {children.map((c, cidx) => row(c, cidx, children, true))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function MenuEditor({ items, pages }: { items: Item[]; pages: Option[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <MenuCard location="HEADER" items={items} pages={pages} />
      <MenuCard location="FOOTER" items={items} pages={pages} />
    </div>
  );
}
