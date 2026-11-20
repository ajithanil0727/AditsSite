"use client";

import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { disableStudentPortalAction, inviteStudentAction } from "@/modules/portal/portal-auth.actions";

export function PortalAccess({
  studentId,
  email,
  state,
  canManage,
}: {
  studentId: string;
  email: string | null;
  state: "none" | "invited" | "active" | "off";
  canManage: boolean;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = { none: "No portal login", invited: "Invited (password not set)", active: "Active", off: "Turned off" }[state];
  const tone = { none: "neutral", invited: "sky", active: "mint", off: "neutral" } as const;
  const invite = () =>
    start(async () => {
      const r = await inviteStudentAction({ id: studentId });
      if (r.ok) {
        setLink(r.data.link);
        toast.success(`Link emailed to ${r.data.email}. You can also copy it below.`);
      } else toast.error(r.error);
    });
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Student portal</span>
        <StatusBadge tone={tone[state]}>{label}</StatusBadge>
      </div>
      {!email && <p className="text-xs text-muted-foreground">Add an email to give portal access (the email is the login).</p>}
      {canManage && email && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={invite} disabled={pending}>
            <KeyRoundIcon /> {state === "none" ? "Give portal access" : "Send a new login link"}
          </Button>
          {(state === "active" || state === "invited") && (
            <ConfirmAction
              trigger={
                <Button size="sm" variant="ghost">
                  Turn off
                </Button>
              }
              title="Turn off portal access?"
              description="The student is signed out and can't sign in until you give access again."
              confirmLabel="Turn off"
              destructive
              successMessage="Portal access turned off"
              action={() => disableStudentPortalAction({ id: studentId })}
            />
          )}
        </div>
      )}
      {link && (
        <div className="space-y-1 rounded-lg border bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Share this link (WhatsApp etc.) if the email doesn&apos;t arrive. It works once, for 7 days.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs" data-testid="portal-link">
              {link}
            </code>
            <Button
              size="xs"
              variant="ghost"
              aria-label="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Copied");
              }}
            >
              <CopyIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
