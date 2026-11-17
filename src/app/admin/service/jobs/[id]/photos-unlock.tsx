"use client";

import { CameraIcon, EyeIcon, LockIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revealUnlockAction, uploadJobPhotoAction } from "@/modules/service/jobs.actions";

export function PhotosAndUnlock({
  jobId,
  photos,
  canAdd,
  hasUnlockCode,
  canReveal,
}: {
  jobId: string;
  photos: { id: string; url: string; label: string | null }[];
  canAdd: boolean;
  hasUnlockCode: boolean;
  canReveal: boolean;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const reveal = () =>
    startTransition(async () => {
      const res = await revealUnlockAction({ jobId });
      if (res.ok) setCode(res.data);
      else toast.error(res.error);
    });

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("jobId", jobId);
        fd.set("file", file);
        const res = await uploadJobPhotoAction(fd);
        if (!res.ok) return void toast.error(res.error);
      }
      toast.success("Photos added");
    });
  };

  return (
    <div className="space-y-3">
      {hasUnlockCode && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <LockIcon className="size-4 text-muted-foreground" />
          <span className="flex-1">
            Unlock code: {code ? <span className="font-mono font-medium">{code}</span> : "••••••"}
          </span>
          {canReveal && !code && (
            <Button size="sm" variant="ghost" onClick={reveal} disabled={pending}>
              <EyeIcon /> Reveal
            </Button>
          )}
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Condition photos</span>
          {canAdd && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => upload(e.target.files)}
              />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
                <CameraIcon /> Add
              </Button>
            </>
          )}
        </div>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md border"
              >
                <Image
                  src={p.url}
                  alt={p.label ?? "Condition photo"}
                  width={160}
                  height={160}
                  className="aspect-square w-full object-cover"
                  unoptimized
                />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No photos.</p>
        )}
      </div>
    </div>
  );
}
