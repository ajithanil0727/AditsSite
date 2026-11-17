import "server-only";
import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { diffForAudit, toAuditJson } from "./audit.diff";

export type AuditActor = {
  organizationId: string;
  userId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditEntry = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Write one audit row. Pass the transaction client so the audit entry commits
 * (or rolls back) together with the change it describes.
 * For UPDATE, only changed fields are stored; an UPDATE with no changes is skipped.
 */
export async function writeAudit(client: Tx | typeof db, actor: AuditActor, entry: AuditEntry) {
  let before = toAuditJson(entry.before);
  let after = toAuditJson(entry.after);
  if (entry.action === "UPDATE") {
    ({ before, after } = diffForAudit(before, after));
    if (!before && !after) return;
  }
  await client.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      branchId: entry.branchId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    },
  });
}
