"use client";

import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SiteChrome } from "@/modules/website/site.data";
import { SmartLink } from "./site-ui";

type Banner = SiteChrome["banners"][number];

/** Banners are cached with the page, so the start/end dates are checked here in the browser. */
function useLive(banners: Banner[], placement: Banner["placement"]) {
  const [live, setLive] = useState<Banner | null>(null);
  useEffect(() => {
    const now = Date.now();
    const found = banners.find(
      (b) =>
        b.placement === placement &&
        new Date(b.startsAt).getTime() <= now &&
        (!b.endsAt || new Date(b.endsAt).getTime() >= now),
    );
    let dismissed = false;
    try {
      dismissed = !!found && sessionStorage.getItem(`banner:${found.id}`) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on the visitor's clock, unknown on the server
    setLive(found && !dismissed ? found : null);
  }, [banners, placement]);
  const dismiss = () => {
    if (live)
      try {
        sessionStorage.setItem(`banner:${live.id}`, "1");
      } catch {}
    setLive(null);
  };
  return [live, dismiss] as const;
}

export function TopBanner({ banners }: { banners: Banner[] }) {
  const [b, dismiss] = useLive(banners, "TOP_BAR");
  if (!b) return null;
  return (
    <div className="relative bg-lavender px-10 py-2 text-center text-sm text-lavender-foreground">
      <span className="font-semibold">{b.title}</span>
      {b.message && <span className="ml-1.5">{b.message}</span>}
      {b.linkUrl && b.linkLabel && (
        <SmartLink href={b.linkUrl} className="ml-2 font-semibold underline underline-offset-2">
          {b.linkLabel}
        </SmartLink>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 hover:bg-background/40"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

export function HomePopup({ banners }: { banners: Banner[] }) {
  const [b, dismiss] = useLive(banners, "HOME_POPUP");
  if (!b) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{b.title}</DialogTitle>
          {b.message && <DialogDescription>{b.message}</DialogDescription>}
        </DialogHeader>
        {b.linkUrl && b.linkLabel && (
          <SmartLink
            href={b.linkUrl}
            onClick={dismiss}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            {b.linkLabel}
          </SmartLink>
        )}
      </DialogContent>
    </Dialog>
  );
}
