"use server";

import { redirect } from "next/navigation";
import { defineAction } from "@/modules/rbac/action";
import { creditNoteSchema } from "./credit-notes.schemas";
import { issueCreditNote } from "./credit-notes.service";

export const issueCreditNoteAction = defineAction(
  { permission: "invoices.credit_note", schema: creditNoteSchema },
  async (input, ctx) => {
    const r = await issueCreditNote(ctx, input);
    redirect(`/admin/invoices/${r.id}`);
  },
);
