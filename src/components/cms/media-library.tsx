"use client";

import { CheckIcon, ImageIcon, Loader2Icon, SearchIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { listMediaAction, uploadMediaAction } from "@/modules/website/website.actions";
import type { MediaItem } from "@/modules/website/website.queries";

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Original", value: null },
  { label: "Square", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:4", value: 3 / 4 },
];
const MAX_EDGE = 2000;

/** Crop on a canvas and export WebP (smaller files; PNG kept for logos with transparency). */
async function cropImage(
  src: string,
  area: Area | null,
  type: string,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const a = area ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
  const scale = Math.min(1, MAX_EDGE / Math.max(a.width, a.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(a.width * scale);
  canvas.height = Math.round(a.height * scale);
  canvas.getContext("2d")!.drawImage(img, a.x, a.y, a.width, a.height, 0, 0, canvas.width, canvas.height);
  const outType = type === "image/png" ? "image/png" : "image/webp";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop failed"))), outType, 0.86),
  );
  return { blob, width: canvas.width, height: canvas.height };
}

function UploadStep({
  file,
  aspect: preferredAspect,
  onDone,
  onCancel,
}: {
  file: File;
  aspect?: number;
  onDone: (m: MediaItem) => void;
  onCancel: () => void;
}) {
  const [src] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(preferredAspect ?? null);
  const [area, setArea] = useState<Area | null>(null);
  const [alt, setAlt] = useState("");
  const [folder, setFolder] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const upload = () =>
    start(async () => {
      try {
        const { blob, width, height } = await cropImage(src, aspect === null ? null : area, file.type);
        const ext = blob.type === "image/png" ? "png" : "webp";
        const fd = new FormData();
        fd.set("file", new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type }));
        fd.set("alt", alt);
        fd.set("folder", folder);
        fd.set("width", String(width));
        fd.set("height", String(height));
        const res = await uploadMediaAction(fd);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Image uploaded");
        onDone(res.data);
      } catch {
        toast.error("Couldn't read that image. Try a PNG, JPG or WebP file.");
      }
    });

  return (
    <div className="grid gap-4">
      <div className="relative h-72 overflow-hidden rounded-lg bg-muted">
        {aspect === null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-contain" />
        ) : (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, px) => setArea(px)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ASPECTS.map((a) => (
          <Button
            key={a.label}
            type="button"
            size="sm"
            variant={aspect === a.value ? "secondary" : "ghost"}
            onClick={() => setAspect(a.value)}
          >
            {a.label}
          </Button>
        ))}
        <label
          className={cn(
            "ml-auto flex items-center gap-2 text-xs text-muted-foreground",
            aspect === null && "invisible",
          )}
        >
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="media-alt">Alt text (describe the image)</Label>
          <Input
            id="media-alt"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={200}
            placeholder="Students soldering a phone board"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="media-folder">Folder</Label>
          <Input
            id="media-folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            maxLength={60}
            placeholder="website"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Back
        </Button>
        <Button type="button" onClick={upload} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Upload
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Browse / search / upload website images and pick one. */
export function MediaLibraryDialog({
  open,
  onOpenChange,
  onSelect,
  aspect,
  selectedId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect?: (m: MediaItem) => void;
  aspect?: number;
  selectedId?: string | null;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [loading, startLoad] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (query: string, f: string) =>
      startLoad(async () => {
        const res = await listMediaAction({ q: query || undefined, folder: f || undefined });
        if (res.ok) {
          setItems(res.data.rows);
          setFolders(res.data.folders);
        } else toast.error(res.error);
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(q, folder), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, q, folder, load]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setFile(null);
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{file ? "Crop and describe" : "Media library"}</DialogTitle>
          <DialogDescription>
            {file
              ? "Drag to position, pick a shape, and add alt text for screen readers and Google."
              : "PNG, JPG or WebP up to 5 MB."}
          </DialogDescription>
        </DialogHeader>
        {file ? (
          <UploadStep
            file={file}
            aspect={aspect}
            onCancel={() => setFile(null)}
            onDone={(m) => {
              setFile(null);
              setItems((list) => [m, ...list]);
              onSelect?.(m);
              if (onSelect) onOpenChange(false);
            }}
          />
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1">
                <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name or alt text…"
                  className="pl-8"
                />
              </div>
              {folders.length > 1 && (
                <select
                  aria-label="Folder"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">All folders</option>
                  {folders.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (!["image/png", "image/jpeg", "image/webp"].includes(f.type))
                    return void toast.error("Use a PNG, JPG or WebP image.");
                  if (f.size > 15 * 1024 * 1024) return void toast.error("That file is too large.");
                  setFile(f);
                }}
              />
              <Button type="button" onClick={() => fileRef.current?.click()}>
                <UploadIcon /> Upload
              </Button>
            </div>
            {loading && items.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2Icon className="animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
                <ImageIcon className="size-6" /> No images yet. Upload one.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!onSelect}
                    onClick={() => {
                      onSelect?.(m);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selectedId === m.id && "ring-2 ring-primary",
                    )}
                    title={m.altText || m.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt={m.altText}
                      loading="lazy"
                      className="size-full object-cover transition group-hover:scale-105"
                    />
                    {selectedId === m.id && (
                      <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                        <CheckIcon className="size-3" />
                      </span>
                    )}
                    {!m.altText && (
                      <span className="absolute bottom-1 left-1 rounded bg-peach px-1 text-[10px] text-peach-foreground">
                        no alt
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A form control: thumbnail + choose / remove. Value is a FileAsset id. */
export function ImagePicker({
  id,
  value,
  onChange,
  aspect,
  invalid,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  aspect?: number;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={value ? "Change image" : "Choose image"}
        className={cn(
          "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted",
          invalid && "border-destructive",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${value}`} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </button>
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {value ? "Change" : "Choose image"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      <MediaLibraryDialog
        open={open}
        onOpenChange={setOpen}
        aspect={aspect}
        selectedId={value}
        onSelect={(m) => onChange(m.id)}
      />
    </div>
  );
}
