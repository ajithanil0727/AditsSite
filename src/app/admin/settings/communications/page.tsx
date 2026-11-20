import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { TestEmailButton } from "./test-email-button";

export const metadata: Metadata = { title: "Communications" };

const TONE = { QUEUED: "sky", SENT: "mint", FAILED: "danger" } as const;

export default async function CommunicationsPage() {
  const user = await requirePagePermission("settings.view");
  const [log, counts, optedIn] = await Promise.all([
    db.messageLog.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.messageLog.groupBy({ by: ["status"], where: { organizationId: user.organizationId }, _count: true }),
    db.user.count({ where: { organizationId: user.organizationId, emailAlerts: true, isActive: true, deletedAt: null } }),
  ]);
  const smtp = !!env.SMTP_HOST;
  const cron = !!env.CRON_SECRET && env.CRON_SECRET.length >= 16 && !env.CRON_SECRET.startsWith("change-me");
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader
        title="Communications"
        description="Emails the system sends. Today: staff alerts (for people who turn on “Email me my alerts” in My account) and student portal invites. SMS and WhatsApp can be added later."
        actions={can(user.access, "settings.update") && <TestEmailButton />}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Email (SMTP)</CardTitle>
            <CardDescription>{smtp ? `Server ${env.SMTP_HOST}:${env.SMTP_PORT}` : "Not set up. Set SMTP_HOST and the other SMTP_ values on the server (see the deployment guide)."}</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusBadge tone={smtp ? "mint" : "peach"}>{smtp ? "set up" : "not set up"}</StatusBadge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Background sending</CardTitle>
            <CardDescription>Emails go out right after each action; a scheduler calling /api/cron/messages retries anything left over.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusBadge tone={cron ? "mint" : "peach"}>{cron ? "CRON_SECRET set" : "CRON_SECRET not set"}</StatusBadge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            <CardDescription>{optedIn} staff get their alerts by email.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <StatusBadge tone="mint">{count("SENT")} sent</StatusBadge>
            <StatusBadge tone="sky">{count("QUEUED")} waiting</StatusBadge>
            <StatusBadge tone="danger">{count("FAILED")} failed</StatusBadge>
          </CardContent>
        </Card>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {log.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No messages yet.
                </TableCell>
              </TableRow>
            )}
            {log.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(m.createdAt)}</TableCell>
                <TableCell>{m.to}</TableCell>
                <TableCell>{m.subject}</TableCell>
                <TableCell>
                  <StatusBadge tone={TONE[m.status]}>{m.status.toLowerCase()}</StatusBadge>
                  {m.error && <div className="text-xs text-muted-foreground">{m.error}</div>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
