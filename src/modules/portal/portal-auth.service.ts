import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { hashPassword } from "@/modules/auth/password";
import { absoluteUrl, queueMessage } from "@/modules/messaging/outbox";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";

/**
 * Student portal accounts + one-time set-password links.
 * A student account is a User linked to the Student, with no roles (so no staff permissions).
 * Links are random 32-byte tokens; only their SHA-256 is stored. Invite links last 7 days, reset links 1 hour.
 */
const INVITE_HOURS = 24 * 7;
const RESET_HOURS = 1;
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

async function createSetPasswordLink(tx: Tx, userId: string, hours: number) {
  // Older unused links stop working when a new one is made.
  await tx.authToken.updateMany({ where: { userId, kind: "SET_PASSWORD", usedAt: null }, data: { usedAt: new Date() } });
  const token = randomBytes(32).toString("base64url");
  await tx.authToken.create({
    data: { userId, kind: "SET_PASSWORD", tokenHash: sha256(token), expiresAt: new Date(Date.now() + hours * 3_600_000) },
  });
  return absoluteUrl(`/set-password?token=${token}`);
}

/** Staff (students.update on the student's branch): give portal access, or send a fresh link. Returns the link to share. */
export async function inviteStudent(ctx: ActionContext, studentId: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.student.findFirst({ where: { id: studentId, organizationId: ctx.user.organizationId, deletedAt: null }, include: { user: true } });
    if (!s) throw new ActionError("Student not found.");
    if (!canAccessBranch(ctx.user.access, "students.update", s.branchId)) throw new ActionError("This student belongs to a branch you can't access.");
    if (!s.email) throw new ActionError("Add the student's email first (Edit details). The portal login is their email.");
    const email = s.email.toLowerCase();
    let user = s.user;
    if (!user) {
      const taken = await tx.user.findUnique({ where: { email } });
      if (taken) throw new ActionError("Another account already uses this email. Use a different email for the student.");
      user = await tx.user.create({ data: { organizationId: s.organizationId, name: s.name, email, phone: s.phone } });
      await tx.student.update({ where: { id: s.id }, data: { userId: user.id } });
    } else {
      if (user.email !== email) user = await tx.user.update({ where: { id: user.id }, data: { email, name: s.name } });
      if (!user.isActive || user.deletedAt) user = await tx.user.update({ where: { id: user.id }, data: { isActive: true, deletedAt: null } });
    }
    const link = await createSetPasswordLink(tx, user.id, INVITE_HOURS);
    await queueMessage(tx, {
      organizationId: s.organizationId,
      channel: "EMAIL",
      to: email,
      subject: "Your student portal login",
      body: `Hi ${s.name},\n\nYou can now see your fees, attendance, results and certificates online.\nSet your password here (the link works for 7 days):\n${link}\n\nThen sign in at ${absoluteUrl("/login")} with ${email}.`,
      templateKey: "portal_invite",
      entityType: "Student",
      entityId: s.id,
    });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Student", entityId: s.id, branchId: s.branchId, after: { portalInvite: email } });
    return { link, email };
  });
}

export async function disableStudentPortal(ctx: ActionContext, studentId: string) {
  await db.$transaction(async (tx) => {
    const s = await tx.student.findFirst({ where: { id: studentId, organizationId: ctx.user.organizationId, deletedAt: null } });
    if (!s || !s.userId) throw new ActionError("This student has no portal access.");
    if (!canAccessBranch(ctx.user.access, "students.update", s.branchId)) throw new ActionError("Not your branch.");
    await tx.user.update({ where: { id: s.userId }, data: { isActive: false } });
    await tx.session.deleteMany({ where: { userId: s.userId } });
    await tx.authToken.updateMany({ where: { userId: s.userId, usedAt: null }, data: { usedAt: new Date() } });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Student", entityId: s.id, branchId: s.branchId, after: { portalAccess: false } });
  });
}

/** Public: set a password from a link. Signs out other sessions. */
export async function setPasswordWithToken(token: string, password: string) {
  return db.$transaction(async (tx) => {
    const row = await tx.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.kind !== "SET_PASSWORD" || row.usedAt || row.expiresAt < new Date() || !row.user.isActive || row.user.deletedAt)
      throw new ActionError("This link has expired or was already used. Ask for a new one.");
    const hash = await hashPassword(password);
    const account = await tx.account.findFirst({ where: { userId: row.userId, providerId: "credential" } });
    if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
    else await tx.account.create({ data: { userId: row.userId, accountId: row.userId, providerId: "credential", password: hash } });
    await tx.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.user.update({ where: { id: row.userId }, data: { emailVerified: true } });
    await writeAudit(tx, { organizationId: row.user.organizationId, userId: row.userId }, { action: "UPDATE", entityType: "User", entityId: row.userId, after: { passwordSetByLink: true } });
    return row.user.email;
  });
}

/** Public: forgot password. Always "sent" (never reveals whether the email exists). */
export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || !user.isActive || user.deletedAt) return;
    const link = await createSetPasswordLink(tx, user.id, RESET_HOURS);
    await queueMessage(tx, {
      organizationId: user.organizationId,
      channel: "EMAIL",
      to: user.email,
      subject: "Reset your password",
      body: `Hi ${user.name},\n\nSomeone asked to reset your password. If it was you, set a new one here (the link works for 1 hour):\n${link}\n\nIf it wasn't you, ignore this email.`,
      templateKey: "password_reset",
    });
  });
}
