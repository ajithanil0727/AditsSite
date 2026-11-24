import "server-only";
import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { NotConfiguredError, providerFor, type Channel } from "./providers";

/**
 * Outbox: messages are written as QUEUED rows (MessageLog) inside the business transaction, then sent after it
 * commits (right after the server action, and by /api/cron/messages for anything left over).
 * Up to MAX_ATTEMPTS tries; then FAILED with the last error.
 */
const MAX_ATTEMPTS = 3;

export async function queueMessage(
  tx: Tx | typeof db,
  m: {
    organizationId: string;
    channel: Channel;
    to: string;
    subject?: string | null;
    body: string;
    templateKey?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  await tx.messageLog.create({
    data: {
      organizationId: m.organizationId,
      channel: m.channel,
      to: m.to,
      subject: m.subject ?? null,
      body: m.body,
      templateKey: m.templateKey ?? null,
      entityType: m.entityType ?? null,
      entityId: m.entityId ?? null,
    },
  });
}

/** Absolute link for emails. */
export function absoluteUrl(path: string) {
  return new URL(path, env.APP_URL).toString();
}

/** Sends queued messages. Rows are claimed with SKIP LOCKED so two runners never send the same one. */
export async function flushOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "MessageLog" SET attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "MessageLog" WHERE status = 'QUEUED' AND attempts < ${MAX_ATTEMPTS}
      ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  for (const { id } of claimed) {
    const m = await db.messageLog.findUnique({ where: { id } });
    if (!m || m.status !== "QUEUED") continue;
    try {
      await providerFor(m.channel as Channel).send({ to: m.to, subject: m.subject, body: m.body });
      await db.messageLog.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), error: null } });
      sent++;
    } catch (e) {
      const final = e instanceof NotConfiguredError || m.attempts >= MAX_ATTEMPTS;
      await db.messageLog.update({
        where: { id },
        data: {
          status: final ? "FAILED" : "QUEUED",
          error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        },
      });
      if (final) failed++;
    }
  }
  return { sent, failed };
}

/** Fire-and-forget flush (never throws). */
export async function flushOutboxQuietly() {
  try {
    await flushOutbox();
  } catch (e) {
    console.error("[outbox] flush failed", e);
  }
}
