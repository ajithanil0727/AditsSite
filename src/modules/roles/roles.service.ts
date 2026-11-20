import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { canManageProtected, permissionsBeyond } from "@/modules/rbac/escalation";
import type { createRoleSchema, updateRoleSchema } from "./roles.schemas";

export async function listRoles(organizationId: string) {
  const roles = await db.role.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      isSystem: true,
      isProtected: true,
      _count: { select: { permissions: true, users: { where: { user: { deletedAt: null } } } } },
    },
    orderBy: [{ isProtected: "desc" }, { isSystem: "desc" }, { name: "asc" }],
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isProtected: r.isProtected,
    permissionCount: r._count.permissions,
    userCount: r._count.users,
  }));
}

export async function getRole(organizationId: string, id: string) {
  const role = await db.role.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: { permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!role) return null;
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? "",
    isSystem: role.isSystem,
    isProtected: role.isProtected,
    discountLimitPercent: role.discountLimitPercent.toNumber(),
    discountLimitAmount: role.discountLimitAmount.toNumber(),
    permissions: role.permissions.map((p) => p.permission.key),
  };
}

export async function createRole(ctx: ActionContext, input: z.output<typeof createRoleSchema>) {
  const orgId = ctx.user.organizationId;
  return db.$transaction(async (tx) => {
    let permissionIds: string[] = [];
    if (input.copyFromRoleId) {
      const source = await tx.role.findFirst({
        where: { id: input.copyFromRoleId, organizationId: orgId, deletedAt: null },
        include: { permissions: { include: { permission: true } } },
      });
      if (!source) throw new ActionError("Role to copy from was not found.");
      const beyond = permissionsBeyond(
        ctx.user.access,
        source.permissions.map((p) => p.permission.key),
      );
      if (beyond.length) throw new ActionError("That role has permissions you don't have, so you can't copy it.");
      permissionIds = source.permissions.map((p) => p.permissionId);
    }
    const role = await tx.role.create({
      data: {
        organizationId: orgId,
        name: input.name,
        description: input.description,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Role", entityId: role.id, after: role });
    return role.id;
  });
}

export async function updateRole(ctx: ActionContext, input: z.output<typeof updateRoleSchema>) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const before = await getRole(orgId, input.id);
    if (!before) throw new ActionError("Role not found.");
    if (before.isProtected && !canManageProtected(ctx.user.access))
      throw new ActionError("Only a super admin can change the Owner and Super Admin roles.");

    // You may only add or remove permissions you hold yourself.
    const added = input.permissions.filter((k) => !before.permissions.includes(k));
    const removed = before.permissions.filter((k) => !(input.permissions as string[]).includes(k));
    const beyond = permissionsBeyond(ctx.user.access, [...added, ...removed]);
    if (beyond.length)
      throw new ActionError(`You can't change permissions you don't have: ${beyond.slice(0, 3).join(", ")}…`);

    // Don't let someone lock themselves out of role management.
    const ownRole = await tx.userRole.findFirst({ where: { userId: ctx.user.id, roleId: input.id } });
    if (ownRole && removed.includes("roles.manage")) {
      const otherSource = await tx.userRole.count({
        where: {
          userId: ctx.user.id,
          roleId: { not: input.id },
          role: { deletedAt: null, permissions: { some: { permission: { key: "roles.manage" } } } },
        },
      });
      if (otherSource === 0)
        throw new ActionError(
          "You'd lose access to role management. Keep 'Roles: Create / edit / delete' on this role.",
        );
    }

    const perms = await tx.permission.findMany({ where: { key: { in: input.permissions } }, select: { id: true } });
    await tx.role.update({
      where: { id: input.id },
      data: {
        name: input.name,
        description: input.description,
        discountLimitPercent: input.discountLimitPercent,
        discountLimitAmount: input.discountLimitAmount,
      },
    });
    await tx.rolePermission.deleteMany({ where: { roleId: input.id } });
    await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: input.id, permissionId: p.id })) });

    const { permissions: _bp, ...beforeMeta } = before;
    void _bp;
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Role",
      entityId: input.id,
      before: beforeMeta,
      after: {
        ...beforeMeta,
        name: input.name,
        description: input.description ?? "",
        discountLimitPercent: input.discountLimitPercent,
        discountLimitAmount: input.discountLimitAmount,
      },
    });
    if (added.length || removed.length) {
      await writeAudit(tx, ctx.actor, {
        action: "PERMISSION_CHANGE",
        entityType: "Role",
        entityId: input.id,
        before: { removed },
        after: { added },
      });
    }
  });
}

export async function deleteRole(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const role = await tx.role.findFirst({
      where: { id, organizationId: ctx.user.organizationId, deletedAt: null },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new ActionError("Role not found.");
    if (role.isSystem) throw new ActionError("Default roles can be edited but not deleted.");
    if (role._count.users > 0) throw new ActionError("Remove this role from all users first.");
    await tx.role.update({
      where: { id },
      data: { deletedAt: new Date(), name: `${role.name} (deleted ${Date.now()})` },
    });
    await writeAudit(tx, ctx.actor, { action: "DELETE", entityType: "Role", entityId: id, before: role });
  });
}
