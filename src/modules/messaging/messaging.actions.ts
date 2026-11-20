"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { defineAction } from "@/modules/rbac/action";
import { queueMessage } from "./outbox";

/** Every signed-in user: turn alert emails on/off for themselves. */
export const setEmailAlertsAction = defineAction({ permission: null, schema: z.object({ on: z.boolean() }) }, async ({ on }, ctx) => {
  await db.user.update({ where: { id: ctx.user.id }, data: { emailAlerts: on } });
  await writeAudit(db, ctx.actor, { action: "UPDATE", entityType: "User", entityId: ctx.user.id, after: { emailAlerts: on } });
  refresh();
});

/** Settings → Communications: send a test email to yourself. */
export const sendTestEmailAction = defineAction({ permission: "settings.update", schema: z.object({}) }, async (_i, ctx) => {
  await queueMessage(db, {
    organizationId: ctx.user.organizationId,
    channel: "EMAIL",
    to: ctx.user.email,
    subject: "Test email",
    body: "If you can read this, email from the management system works.",
    templateKey: "test",
  });
  refresh();
});
