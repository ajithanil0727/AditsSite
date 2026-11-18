"use server";

import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import { markRead, unreadNotifications } from "./notifications.service";
import { followUpCounts } from "@/modules/leads/leads.queries";
import { can } from "@/modules/rbac/access";

export const loadNotificationsAction = defineAction({ permission: null, schema: z.object({}) }, async (_i, ctx) => {
  const [list, followUps] = await Promise.all([
    unreadNotifications(ctx.user.id),
    can(ctx.user.access, "leads.view") ? followUpCounts(ctx.user) : Promise.resolve(null),
  ]);
  return {
    unread: list.unread,
    followUps,
    items: list.items.map((n) => ({
      ...n,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
});

export const markNotificationReadAction = defineAction(
  { permission: null, schema: z.object({ id: z.string().nullable() }) },
  async ({ id }, ctx) => markRead(ctx.user.id, id),
);
