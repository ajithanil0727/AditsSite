import "server-only";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import {
  branchesBeyond,
  canGrantRole,
  canManageProtected,
  protectedRoleChangeProblem,
} from "@/modules/rbac/escalation";
import type { UserData } from "./users.schemas";

/** Snapshot used for audit before/after (never includes the password). */
async function snapshot(tx: Tx, id: string) {
  const u = await tx.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      deletedAt: true,
      roles: { select: { roleId: true, scope: true, role: { select: { name: true } } }, orderBy: { roleId: "asc" } },
      branches: { select: { branchId: true }, orderBy: { branchId: "asc" } },
    },
  });
  if (!u) return null;
  return {
    ...u,
    roles: u.roles.map((r) => `${r.role.name} (${r.scope})`),
    branches: u.branches.map((b) => b.branchId),
  };
}

/**
 * May the actor manage this target user? With ALL_BRANCHES scope: anyone.
 * Otherwise only users who belong exclusively to the actor's branches.
 */
async function assertCanManage(
  tx: Tx,
  ctx: ActionContext,
  targetId: string,
  permission: "users.update" | "users.delete" | "users.reset_password",
) {
  const target = await tx.user.findFirst({
    where: { id: targetId, organizationId: ctx.user.organizationId },
    select: {
      id: true,
      branches: { select: { branchId: true } },
      roles: { where: { role: { isProtected: true } }, select: { roleId: true } },
    },
  });
  if (!target) throw new ActionError("User not found.");
  // Owners' and super admins' accounts: only the super admin (people may still edit their own details).
  if (target.roles.length && target.id !== ctx.user.id && !canManageProtected(ctx.user.access)) {
    throw new ActionError("Only a super admin can change an owner's or super admin's account.");
  }
  const outside = target.branches.filter((b) => !canAccessBranch(ctx.user.access, permission, b.branchId));
  if (outside.length || (target.branches.length === 0 && !ctx.user.access.canSeeAllBranches)) {
    throw new ActionError("This user works in branches you don't manage.");
  }
  return target;
}

async function assertGrantable(tx: Tx, ctx: ActionContext, input: UserData) {
  const roles = await tx.role.findMany({
    where: { id: { in: input.roles.map((r) => r.roleId) }, organizationId: ctx.user.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      isProtected: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });
  if (roles.length !== input.roles.length) throw new ActionError("One of the selected roles no longer exists.");
  const current = input.id
    ? await tx.userRole.findMany({
        where: { userId: input.id },
        select: { roleId: true, role: { select: { isProtected: true } } },
      })
    : [];
  const protectedProblem = protectedRoleChangeProblem(ctx.user.access, {
    before: current.map((r) => ({ roleId: r.roleId, isProtected: r.role.isProtected })),
    after: roles.map((r) => ({ roleId: r.id, isProtected: r.isProtected })),
  });
  if (protectedProblem) throw new ActionError(protectedProblem);
  for (const assignment of input.roles) {
    const role = roles.find((r) => r.id === assignment.roleId)!;
    // Keeping a protected role you already hold (editing your own details) isn't granting it.
    if (role.isProtected && current.some((c) => c.roleId === role.id)) continue;
    const problem = canGrantRole(
      ctx.user.access,
      role.permissions.map((p) => p.permission.key),
      assignment.scope,
    );
    if (problem) throw new ActionError(`${role.name}: ${problem}`);
  }
  if (branchesBeyond(ctx.user.access, input.branchIds).length) {
    throw new ActionError("You can only assign branches you have access to.");
  }
  const branchCount = await tx.branch.count({
    where: { id: { in: input.branchIds }, organizationId: ctx.user.organizationId, deletedAt: null },
  });
  if (branchCount !== input.branchIds.length) throw new ActionError("One of the selected branches no longer exists.");
}

export async function saveUser(ctx: ActionContext, input: UserData) {
  const orgId = ctx.user.organizationId;
  if (input.id === ctx.user.id && !input.isActive) throw new ActionError("You can't deactivate your own account.");

  return db.$transaction(async (tx) => {
    await assertGrantable(tx, ctx, input);
    const before = input.id ? await snapshot(tx, input.id) : null;
    if (input.id) await assertCanManage(tx, ctx, input.id, "users.update");

    const base = { name: input.name, email: input.email, phone: input.phone, isActive: input.isActive };
    const user = input.id
      ? await tx.user.update({ where: { id: input.id }, data: base })
      : await tx.user.create({ data: { ...base, organizationId: orgId, emailVerified: true } });

    if (input.password) {
      const hash = await hashPassword(input.password);
      const account = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
      if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
      else
        await tx.account.create({
          data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
        });
    }

    await tx.userRole.deleteMany({ where: { userId: user.id } });
    await tx.userRole.createMany({
      data: input.roles.map((r) => ({ userId: user.id, roleId: r.roleId, scope: r.scope })),
    });
    await tx.userBranch.deleteMany({ where: { userId: user.id } });
    await tx.userBranch.createMany({ data: input.branchIds.map((branchId) => ({ userId: user.id, branchId })) });

    // Deactivated or password changed: end their sessions.
    if (input.id && (!input.isActive || input.password)) await tx.session.deleteMany({ where: { userId: user.id } });

    const after = await snapshot(tx, user.id);
    await writeAudit(tx, ctx.actor, {
      action: input.id ? "UPDATE" : "CREATE",
      entityType: "User",
      entityId: user.id,
      before,
      after,
    });
    if (before && JSON.stringify(before.roles) !== JSON.stringify(after?.roles)) {
      await writeAudit(tx, ctx.actor, {
        action: "PERMISSION_CHANGE",
        entityType: "User",
        entityId: user.id,
        before: { roles: before.roles },
        after: { roles: after?.roles },
      });
    }
    return user.id;
  });
}

export async function resetUserPassword(ctx: ActionContext, id: string, password: string) {
  await db.$transaction(async (tx) => {
    await assertCanManage(tx, ctx, id, "users.reset_password");
    const hash = await hashPassword(password);
    const account = await tx.account.findFirst({ where: { userId: id, providerId: "credential" } });
    if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
    else await tx.account.create({ data: { userId: id, accountId: id, providerId: "credential", password: hash } });
    await tx.session.deleteMany({ where: { userId: id } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      before: { password: "old" },
      after: { password: "new" },
    });
  });
}

export async function setUserDeleted(ctx: ActionContext, id: string, deleted: boolean) {
  if (id === ctx.user.id) throw new ActionError("You can't delete your own account.");
  await db.$transaction(async (tx) => {
    await assertCanManage(tx, ctx, id, "users.delete");
    const before = await snapshot(tx, id);
    await tx.user.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    if (deleted) await tx.session.deleteMany({ where: { userId: id } });
    await writeAudit(tx, ctx.actor, {
      action: deleted ? "DELETE" : "RESTORE",
      entityType: "User",
      entityId: id,
      before,
      after: await snapshot(tx, id),
    });
  });
}

/**
 * A signed-in user changes their own password: the current one must be right. Their other sessions
 * (other devices) are signed out; this one stays signed in.
 */
export async function changeOwnPassword(
  ctx: ActionContext,
  input: { currentPassword: string; newPassword: string },
  currentSessionId: string | null,
) {
  const account = await db.account.findFirst({ where: { userId: ctx.user.id, providerId: "credential" } });
  const ok = account?.password
    ? await verifyPassword({ hash: account.password, password: input.currentPassword })
    : false;
  if (!account || !ok) {
    await writeAudit(db, ctx.actor, {
      action: "UPDATE",
      entityType: "User",
      entityId: ctx.user.id,
      after: { passwordChange: "failed: wrong current password" },
    });
    throw new ActionError("Your current password is not correct.");
  }
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id: account.id }, data: { password: await hashPassword(input.newPassword) } });
    await tx.session.deleteMany({
      where: { userId: ctx.user.id, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) },
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "User",
      entityId: ctx.user.id,
      before: { password: "old" },
      after: { password: "changed by the user" },
    });
  });
}
