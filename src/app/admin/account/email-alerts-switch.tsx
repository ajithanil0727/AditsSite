"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setEmailAlertsAction } from "@/modules/messaging/messaging.actions";

export function EmailAlertsSwitch({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-3 text-sm">
      <Switch
        checked={on}
        disabled={pending}
        onCheckedChange={(v) =>
          start(async () => {
            const res = await setEmailAlertsAction({ on: v });
            if (res.ok) toast.success(v ? "Alerts will also come by email" : "Alert emails off");
            else toast.error(res.error);
          })
        }
      />
      Email me my alerts (approvals, new enquiries, leave requests…)
    </label>
  );
}
