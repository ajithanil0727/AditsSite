import "server-only";
import { db, type Tx } from "@/lib/db";

/** In-app notifications (the bell). Email/WhatsApp come with message templates later. */
export async function notify(
  tx: Tx | typeof db,
  userIds: (string | null | undefined)[],
  message: { title: string; body: string; link?: string | null },
) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      title: message.title.slice(0, 150),
      body: message.body.slice(0, 500),
      link: message.link ?? null,
    })),
  });
}

export async function unreadNotifications(userId: string) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(userId: string, id: string | null) {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
}
