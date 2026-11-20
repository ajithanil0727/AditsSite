"use client";

import { MailIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestEmailAction } from "@/modules/messaging/messaging.actions";

export function TestEmailButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await sendTestEmailAction({});
          if (res.ok) toast.success("Test email queued. Refresh in a few seconds to see if it was sent.");
          else toast.error(res.error);
        })
      }
    >
      <MailIcon /> Send me a test email
    </Button>
  );
}
