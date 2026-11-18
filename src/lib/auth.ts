import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { writeAudit } from "@/modules/audit/audit.service";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/modules/auth/password";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Users are created by admins only (see users.service.ts).
    disableSignUp: true,
    minPasswordLength: 8,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      // 5 attempts per minute per IP. Only the Playwright test server raises it (AUTH_LOGIN_MAX_PER_MINUTE).
      "/sign-in/email": { window: 60, max: Number(process.env.AUTH_LOGIN_MAX_PER_MINUTE ?? 5) },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Block deactivated or deleted users from getting a session.
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true, deletedAt: true },
          });
          if (!user || !user.isActive || user.deletedAt) return false;
        },
        after: async (session) => {
          const user = await db.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
            select: { organizationId: true },
          });
          await writeAudit(
            db,
            {
              organizationId: user.organizationId,
              userId: session.userId,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            },
            { action: "LOGIN", entityType: "User", entityId: session.userId },
          );
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-out") return;
      const session = await getSessionFromCtx(ctx);
      if (!session) return;
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      });
      if (!user) return;
      await writeAudit(
        db,
        { organizationId: user.organizationId, userId: session.user.id },
        { action: "LOGOUT", entityType: "User", entityId: session.user.id },
      );
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" || !(ctx.context.returned instanceof APIError)) return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : null;
      const user = email
        ? await db.user.findUnique({ where: { email }, select: { id: true, organizationId: true } })
        : null;
      const org = user ? null : await db.organization.findFirst({ select: { id: true } });
      const organizationId = user?.organizationId ?? org?.id;
      if (!organizationId) return;
      await writeAudit(
        db,
        {
          organizationId,
          userId: user?.id ?? null,
          ipAddress: ctx.request?.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
          userAgent: ctx.request?.headers.get("user-agent") ?? null,
        },
        { action: "LOGIN_FAILED", entityType: "User", entityId: user?.id ?? null, after: { email } },
      );
    }),
  },
  plugins: [nextCookies()],
});
