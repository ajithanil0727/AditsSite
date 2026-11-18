"use client";

import { BellIcon, CalendarClockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadNotificationsAction, markNotificationReadAction } from "@/modules/notifications/notifications.actions";

type Data = {
  unread: number;
  followUps: { overdue: number; today: number; mine: boolean } | null;
  items: { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[];
};

/** Bell in the top bar: new enquiries, assignments, conversions, plus today's follow-ups. Polls every minute. */
export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();

  const load = useCallback(() => {
    start(async () => {
      const res = await loadNotificationsAction({});
      if (res.ok) setData(res.data);
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const due = (data?.followUps?.overdue ?? 0) + (data?.followUps?.today ?? 0);
  const badge = (data?.unread ?? 0) + due;

  const openItem = (id: string, link: string | null) =>
    start(async () => {
      await markNotificationReadAction({ id });
      setOpen(false);
      if (link) router.push(link);
      load();
    });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={badge ? `Notifications (${badge})` : "Notifications"}
        >
          <BellIcon />
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {!!data?.unread && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                start(async () => {
                  await markNotificationReadAction({ id: null });
                  load();
                })
              }
            >
              Mark all read
            </button>
          )}
        </div>
        {due > 0 && (
          <Link
            href="/admin/leads/follow-ups"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-b bg-peach/60 px-3 py-2 text-sm text-peach-foreground hover:bg-peach"
          >
            <CalendarClockIcon className="size-4 shrink-0" />
            <span>
              {data!.followUps!.mine ? "Your follow-ups" : "Follow-ups"}: {data!.followUps!.today} today
              {data!.followUps!.overdue ? `, ${data!.followUps!.overdue} overdue` : ""}
            </span>
          </Link>
        )}
        <div className="max-h-96 overflow-y-auto">
          {!data || data.items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            data.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n.id, n.link)}
                className={cn(
                  "block w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-accent",
                  !n.readAt && "bg-lavender/30",
                )}
              >
                <span className="flex items-start gap-2">
                  {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="block text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
