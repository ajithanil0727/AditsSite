"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { defineAction } from "@/modules/rbac/action";
import { activitySchema, assignLeadSchema, deleteLeadSchema, leadSchema, statusChangeSchema } from "./leads.schemas";
import { addActivity, assignLead, changeLeadStatus, createLead, deleteLead, updateLead } from "./leads.service";

const done = <T>(r: T) => {
  refresh();
  return r;
};

export const saveLeadAction = defineAction(
  { permission: (i) => (i.id ? "leads.update" : "leads.create"), schema: leadSchema },
  async (input, ctx) => {
    if (input.id) return done(await updateLead(ctx, input));
    const r = await createLead(ctx, input);
    redirect(`/admin/leads/${r.id}${r.merged ? "?merged=1" : ""}`);
  },
);

export const addLeadActivityAction = defineAction(
  { permission: "leads.update", schema: activitySchema },
  async (i, ctx) => done(await addActivity(ctx, i)),
);

export const changeLeadStatusAction = defineAction(
  { permission: "leads.update", schema: statusChangeSchema },
  async (i, ctx) => done(await changeLeadStatus(ctx, i)),
);

export const assignLeadAction = defineAction({ permission: "leads.assign", schema: assignLeadSchema }, async (i, ctx) =>
  done(await assignLead(ctx, i)),
);

export const deleteLeadAction = defineAction({ permission: "leads.delete", schema: deleteLeadSchema }, async (i, ctx) =>
  done(await deleteLead(ctx, i.leadId, !!i.restore)),
);
