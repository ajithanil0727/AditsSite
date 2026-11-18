"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UploadCloudIcon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { CmsFields } from "@/components/cms/cms-fields";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/modules/rbac/action";
import { SECTION_TYPES, SECTIONS, sectionSchema, type SectionType } from "@/modules/website/sections";
import {
  addSectionAction,
  deletePageAction,
  discardDraftAction,
  moveSectionAction,
  publishPageAction,
  removeSectionAction,
  saveSectionAction,
  setSectionVisibleAction,
  unpublishPageAction,
} from "@/modules/website/website.actions";
import type { EditorPage } from "@/modules/website/website.queries";
import { PageSettingsDialog } from "../page-dialogs";

type Section = EditorPage["sections"][number];

function run(start: (fn: () => Promise<void>) => void, fn: () => Promise<ActionResult<unknown>>, ok?: string) {
  start(async () => {
    const res = await fn();
    if (!res.ok) toast.error(res.error);
    else if (ok) toast.success(ok);
  });
}

function SectionDialog({ section, trigger }: { section: Section; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const type = section.type as SectionType;
  const def = SECTIONS[type];
  const form = useForm<FieldValues>({
    resolver: zodResolver(sectionSchema(type) as never) as unknown as Resolver<FieldValues>,
    defaultValues: section.content,
  });
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      const res = await saveSectionAction({ id: section.id, content: form.getValues() });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Section saved to the draft");
      setOpen(false);
    }),
  );
  if (!def) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(section.content);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{def.label}</DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <CmsFields fields={def.fields} control={form.control} />
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save to draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSectionDialog({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon /> Add section
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a section</DialogTitle>
          <DialogDescription>
            It&apos;s added at the bottom with sample content. Edit and move it after.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await addSectionAction({ pageId, type: t });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(`${SECTIONS[t].label} added`);
                  setOpen(false);
                })
              }
              className="rounded-lg border p-3 text-left hover:border-primary hover:bg-accent disabled:opacity-50"
            >
              <span className="block font-medium">{SECTIONS[t].label}</span>
              <span className="block text-xs text-muted-foreground">{SECTIONS[t].description}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One-line summary of a section's content for the list. */
function summary(s: Section): string {
  const c = s.content as Record<string, unknown>;
  const text = (c.headline ?? c.title ?? c.body ?? "") as string;
  const items = Array.isArray(c.items) ? ` · ${c.items.length} item(s)` : "";
  return `${String(text).slice(0, 90)}${items}`;
}

export function PageEditor({
  page,
  builtIn,
  canEdit,
  canPublish,
}: {
  page: EditorPage;
  builtIn: string | null;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const [pending, start] = useTransition();
  const isCustom = page.kind === "CUSTOM";
  const live = !isCustom || page.status === "PUBLISHED";
  return (
    <>
      <PageHeader
        title={page.title}
        description={`${page.path} · ${live ? "on the website" : "not on the website yet"}`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/preview/${page.id}`} target="_blank" rel="noopener noreferrer">
                <EyeIcon /> Preview draft
              </a>
            </Button>
            {live && (
              <Button asChild variant="ghost">
                <a href={page.path} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon /> Live page
                </a>
              </Button>
            )}
            {canEdit && (
              <PageSettingsDialog
                isCustom={isCustom}
                initial={{
                  id: page.id,
                  title: page.title,
                  slug: page.slug,
                  seoTitle: page.seoTitle,
                  seoDescription: page.seoDescription,
                  ogImageId: page.ogImageId,
                }}
                trigger={
                  <Button variant="outline">
                    <SettingsIcon /> Settings
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <Card className={cn("mb-6", page.hasDraftChanges ? "border-peach-foreground/30 bg-peach/40" : "bg-mint/30")}>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm">
            {page.hasDraftChanges
              ? "You have changes that visitors can't see yet. Preview them, then publish."
              : live
                ? "Everything here is live on the website."
                : "This page is ready to publish."}
          </p>
          {canEdit && page.hasDraftChanges && page.publishedAt && (
            <ConfirmAction
              trigger={<Button variant="ghost">Discard changes</Button>}
              title="Discard draft changes?"
              description="Sections go back to what is live on the website."
              confirmLabel="Discard"
              destructive
              successMessage="Draft discarded"
              action={() => discardDraftAction({ id: page.id })}
            />
          )}
          {canPublish && isCustom && page.status === "PUBLISHED" && (
            <ConfirmAction
              trigger={<Button variant="ghost">Take off the site</Button>}
              title="Take this page off the website?"
              description="Visitors will get 'page not found'. You can publish it again any time."
              confirmLabel="Take off"
              action={() => unpublishPageAction({ id: page.id })}
              successMessage="Page taken off the site"
            />
          )}
          {canPublish && (page.hasDraftChanges || !live) && (
            <Button
              disabled={pending}
              onClick={() => run(start, () => publishPageAction({ id: page.id }), "Published. The website is updated.")}
            >
              <UploadCloudIcon /> Publish
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {page.sections.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No sections yet. Add one.
          </p>
        )}
        {page.sections.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs",
              !s.isVisible && "opacity-60",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{s.label}</span>
                {!s.isVisible && <StatusBadge tone="neutral">Hidden</StatusBadge>}
                {s.isNew ? (
                  <StatusBadge tone="sky">New</StatusBadge>
                ) : (
                  s.changed && <StatusBadge tone="peach">Changed</StatusBadge>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">{summary(s)}</p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  disabled={i === 0 || pending}
                  onClick={() => run(start, () => moveSectionAction({ id: s.id, direction: "up" }))}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={i === page.sections.length - 1 || pending}
                  onClick={() => run(start, () => moveSectionAction({ id: s.id, direction: "down" }))}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={s.isVisible ? "Hide" : "Show"}
                  disabled={pending}
                  onClick={() => run(start, () => setSectionVisibleAction({ id: s.id, visible: !s.isVisible }))}
                >
                  {s.isVisible ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
                <SectionDialog
                  section={s}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.label}`}>
                      <PencilIcon />
                    </Button>
                  }
                />
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label="Remove">
                      <Trash2Icon />
                    </Button>
                  }
                  title={`Remove the ${s.label} section?`}
                  description={
                    s.isNew
                      ? "It hasn't been published, so it's deleted now."
                      : "It stays on the live site until you publish."
                  }
                  confirmLabel="Remove"
                  destructive
                  action={() => removeSectionAction({ id: s.id })}
                />
              </div>
            )}
          </div>
        ))}
        {builtIn && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted">⋯</span>
            Then: {builtIn} (always shown; managed in its own screen)
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && <AddSectionDialog pageId={page.id} />}
        {canEdit && isCustom && (
          <ConfirmAction
            trigger={
              <Button variant="ghost" className="ml-auto text-destructive">
                <Trash2Icon /> Delete page
              </Button>
            }
            title="Delete this page?"
            description="It's removed from the website and from any menu."
            confirmLabel="Delete"
            destructive
            action={() => deletePageAction({ id: page.id })}
          />
        )}
      </div>
    </>
  );
}
