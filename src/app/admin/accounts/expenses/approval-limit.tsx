"use client";

import { SettingsIcon } from "lucide-react";
import { FormDialog } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { saveAccountsSettingsAction } from "@/modules/accounts/accounts.actions";
import { accountsSettingsSchema } from "@/modules/accounts/accounts.schemas";

export function ApprovalLimitForm({ limit }: { limit: number }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline">
          <SettingsIcon /> Approval limit
        </Button>
      }
      title="Expense approval limit"
      description="Expenses with a total above this need approval from someone who can approve expenses (not the person who entered it). People who can approve skip it for their own entries."
      schema={accountsSettingsSchema}
      defaultValues={{ expenseApprovalLimit: limit }}
      action={saveAccountsSettingsAction}
      successMessage="Limit saved"
    >
      {(form) => (
        <TextField
          control={form.control}
          name="expenseApprovalLimit"
          label="Limit (₹)"
          type="number"
          min={0}
          step="1"
        />
      )}
    </FormDialog>
  );
}
