"use client";

import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, SearchIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MediaLibraryDialog } from "@/components/cms/media-library";
import { useUrlState } from "@/components/data-table/data-table";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { deleteMediaAction, updateMediaAction } from "@/modules/website/website.actions";
import type { MediaItem } from "@/modules/website/website.queries";

function EditDialog({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [alt, setAlt] = useState(item.altText);
  const [folder, setFolder] = useState(item.folder);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Image details</DialogTitle>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.altText} className="max-h-64 w-full rounded-lg bg-muted object-contain" />
        <p className="text-xs text-muted-foreground">
          {item.name} · {item.width && item.height ? `${item.width}×${item.height} · ` : ""}
          {Math.round(item.sizeBytes / 1024)} KB · uploaded {formatDate(item.createdAt)}
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="alt">Alt text</Label>
            <Input
              id="alt"
              value={alt}
              maxLength={200}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe what's in the image"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="folder">Folder</Label>
            <Input id="folder" value={folder} maxLength={60} onChange={(e) => setFolder(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <ConfirmAction
            trigger={
              <Button variant="ghost" className="text-destructive">
                Delete
              </Button>
            }
            title="Delete this image?"
            description="Images still used on the website can't be deleted; you'll be told where they're used."
            confirmLabel="Delete"
            destructive
            successMessage="Image deleted"
            action={async () => {
              const res = await deleteMediaAction({ id: item.id });
              if (res.ok) onClose();
              return res;
            }}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateMediaAction({ id: item.id, altText: alt, folder });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Saved");
                  onClose();
                })
              }
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MediaManager({
  items,
  total,
  page,
  pageSize,
  folders,
}: {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
  folders: string[];
}) {
  const { params, set } = useUrlState();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
  }, [q, params, set]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or alt text…"
            className="pl-8"
          />
        </div>
        {folders.length > 0 && (
          <select
            aria-label="Folder"
            value={params.get("f_folder") ?? ""}
            onChange={(e) => set({ f_folder: e.target.value || null })}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">All folders</option>
            {folders.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        )}
        <Button className="ml-auto" onClick={() => setUploading(true)}>
          <UploadIcon /> Upload
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No images found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((m) => (
            <figure key={m.id} className="group overflow-hidden rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setEditing(m)}
                className="block aspect-square w-full bg-muted"
                title="Edit details"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.altText} loading="lazy" className="size-full object-cover" />
              </button>
              <figcaption className="flex items-center gap-1 p-2 text-xs">
                <span
                  className={m.altText ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-peach-foreground"}
                >
                  {m.altText || "No alt text"}
                </span>
                <button
                  type="button"
                  aria-label="Copy link"
                  title="Copy link"
                  className="rounded p-1 text-muted-foreground hover:bg-accent"
                  onClick={() => {
                    void navigator.clipboard?.writeText(m.url);
                    toast.success("Link copied: paste it into text as ![alt](link)");
                  }}
                >
                  <CopyIcon className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => set({ page: String(page - 1) }, false)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => set({ page: String(page + 1) }, false)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}
      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} />}
      <MediaLibraryDialog
        open={uploading}
        onOpenChange={(o) => {
          setUploading(o);
          if (!o) router.refresh();
        }}
      />
    </div>
  );
}
