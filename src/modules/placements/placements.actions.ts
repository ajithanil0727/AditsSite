"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import {
  addApplicantsSchema,
  applicationStatusSchema,
  companySchema,
  driveSchema,
  offerSchema,
  roundSchema,
} from "./placements.schemas";
import {
  addApplicants,
  deleteDrive,
  deleteOffer,
  saveCompany,
  saveDrive,
  saveOffer,
  saveRound,
  setApplicationStatus,
} from "./placements.service";

const done = <T>(r: T) => {
  refresh();
  return r;
};
const id = z.object({ id: z.string().min(1) });

export const saveCompanyAction = defineAction(
  { permission: "companies.manage", schema: companySchema },
  async (i, ctx) => done({ id: await saveCompany(ctx, i) }),
);
export const saveDriveAction = defineAction(
  { permission: "placements.manage_drives", schema: driveSchema },
  async (i, ctx) => {
    const driveId = await saveDrive(ctx, i);
    if (!i.id) redirect(`/admin/placements/drives/${driveId}`);
    return done({ id: driveId });
  },
);
export const deleteDriveAction = defineAction(
  { permission: "placements.manage_drives", schema: id },
  async (i, ctx) => {
    await deleteDrive(ctx, i.id);
    redirect("/admin/placements/drives");
  },
);
export const addApplicantsAction = defineAction(
  { permission: "placements.manage_applications", schema: addApplicantsSchema },
  async (i, ctx) => done({ added: await addApplicants(ctx, i) }),
);
export const setApplicationStatusAction = defineAction(
  { permission: "placements.manage_applications", schema: applicationStatusSchema },
  async (i, ctx) => done(await setApplicationStatus(ctx, i)),
);
export const saveRoundAction = defineAction(
  { permission: "placements.manage_applications", schema: roundSchema },
  async (i, ctx) => done(await saveRound(ctx, i)),
);
export const saveOfferAction = defineAction(
  { permission: "placements.manage_applications", schema: offerSchema },
  async (i, ctx) => done(await saveOffer(ctx, i)),
);
export const deleteOfferAction = defineAction(
  { permission: "placements.manage_applications", schema: id },
  async (i, ctx) => done(await deleteOffer(ctx, i.id)),
);
