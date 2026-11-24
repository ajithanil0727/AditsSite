"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { flushOutboxQuietly } from "@/modules/messaging/outbox";
import { ActionError, defineAction } from "@/modules/rbac/action";
import { passwordSchema } from "@/modules/users/users.schemas";
import { disableStudentPortal, inviteStudent, requestPasswordReset, setPasswordWithToken } from "./portal-auth.service";

const id = z.object({ id: z.string().min(1) });

export const inviteStudentAction = defineAction({ permission: "students.update", schema: id }, async (i, ctx) => {
  const r = await inviteStudent(ctx, i.id);
  refresh();
  return r;
});
export const disableStudentPortalAction = defineAction(
  { permission: "students.update", schema: id },
  async (i, ctx) => {
    await disableStudentPortal(ctx, i.id);
    refresh();
  },
);

// ------------------------------------------------------------------ public (no session)

const hits = new Map<string, number[]>();
function limited(key: string, max: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > max;
}
async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export type PublicResult = { ok: true; message: string } | { ok: false; error: string };

const setSchema = z
  .object({ token: z.string().min(20).max(200), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });

export async function setPasswordAction(input: {
  token: string;
  password: string;
  confirm: string;
}): Promise<PublicResult> {
  if (limited(`set:${await ip()}`, 20)) return { ok: false, error: "Too many tries. Please wait a few minutes." };
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password." };
  try {
    const email = await setPasswordWithToken(parsed.data.token, parsed.data.password);
    return { ok: true, message: email };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[set-password]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function forgotPasswordAction(input: { email: string }): Promise<PublicResult> {
  const sent = {
    ok: true as const,
    message: "If that email has an account, a reset link is on its way. It works for 1 hour.",
  };
  const parsed = z.object({ email: z.email() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };
  if (limited(`forgot:${await ip()}`, 5) || limited(`forgot:${parsed.data.email.toLowerCase()}`, 3)) return sent;
  await requestPasswordReset(parsed.data.email);
  after(flushOutboxQuietly);
  return sent;
}
