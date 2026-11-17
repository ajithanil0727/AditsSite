"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { issuePartAction, rejectPartRequestAction } from "@/modules/service/jobs.actions";
import { issuePartSchema } from "@/modules/service/service.schemas";

export function RequestActions({
  jobId,
  requestId,
  partId,
  qty,
  price,
}: {
  jobId: string;
  requestId: string;
  partId: string;
  qty: number;
  price: number | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <FormDialog
        trigger={<Button size="sm">Issue</Button>}
        title="Issue part"
        schema={issuePartSchema}
        defaultValues={{ jobId, partId, qty: String(qty), unitPrice: price != null ? String(price) : "", requestId }}
        action={issuePartAction}
        submitLabel="Issue"
        successMessage="Part issued"
      >
        {(form) => (
          <div className="grid grid-cols-2 gap-4">
            <TextField control={form.control} name="qty" label="Quantity" type="number" step="0.001" min={0} />
            <TextField
              control={form.control}
              name="unitPrice"
              label="Price each (₹ incl. GST)"
              type="number"
              step="1"
              min={0}
            />
          </div>
        )}
      </FormDialog>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await rejectPartRequestAction({ requestId, note: null });
            if (r.ok) toast.success("Request rejected");
            else toast.error(r.error);
          })
        }
      >
        Reject
      </Button>
    </div>
  );
}
