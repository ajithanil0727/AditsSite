import "server-only";
import { db, type Tx } from "@/lib/db";
import { absoluteUrl, queueMessage } from "@/modules/messaging/outbox";

/** In-app notifications (the bell). People who turned on "Email me my alerts" also get them by email (outbox). */
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
  const emailTo = await tx.user.findMany({
    where: { id: { in: ids }, emailAlerts: true, isActive: true, deletedAt: null },
    select: { email: true, organizationId: true },
  });
  for (const u of emailTo) {
    await queueMessage(tx, {
      organizationId: u.organizationId,
      channel: "EMAIL",
      to: u.email,
      subject: message.title.slice(0, 150),
      body: `${message.body}${message.link ? `

Open: ${absoluteUrl(message.link)}` : ""}

You get this because "Email me my alerts" is on in My account.`,
      templateKey: "staff_alert",
    });
  }
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
