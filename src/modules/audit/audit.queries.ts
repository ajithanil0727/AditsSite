import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint } from "@/modules/rbac/access";

export const AUDIT_ACTIONS: AuditAction[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "RESTORE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PERMISSION_CHANGE",
  "APPROVE",
  "REJECT",
  "EXPORT",
];

/** dd/mm/yyyy -> Date at IST midnight (UTC 18:30 the previous day). */
function parseIndianDate(value: string | undefined, endOfDay = false): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/); // <input type="date"> sends yyyy-mm-dd
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3]) - 330 * 60_000;
  return new Date(endOfDay ? utc + 86_400_000 - 1 : utc);
}

export async function listAuditLogs(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "audit.view", activeBranchId);
  const from = parseIndianDate(p.filters.from);
  const to = parseIndianDate(p.filters.to, true);
  const where: Prisma.AuditLogWhereInput = {
    organizationId: user.organizationId,
    // Branch-limited viewers see entries for their branches only (no org-wide entries).
    ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
    ...(p.filters.action ? { action: p.filters.action as AuditAction } : {}),
    ...(p.filters.entity ? { entityType: p.filters.entity } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(p.q
      ? {
          OR: [
            { entityId: { contains: p.q } },
            { user: { name: { contains: p.q, mode: "insensitive" } } },
            { user: { email: { contains: p.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } }, branch: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      ...paging(p),
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where: { organizationId: user.organizationId },
      distinct: ["entityType"],
      select: { entityType: true },
    }),
  ]);
  return {
    total,
    entityTypes: entities.map((e) => e.entityType).sort(),
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      branchCode: r.branch?.code ?? null,
      ipAddress: r.ipAddress,
      before: r.before,
      after: r.after,
    })),
  };
}

export type AuditRow = Awaited<ReturnType<typeof listAuditLogs>>["rows"][number];
