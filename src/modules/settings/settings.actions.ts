"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { saveUpload, IMAGE_TYPES } from "@/modules/files/files.service";
import { can } from "@/modules/rbac/access";
import { ActionError, defineAction, type ActionResult } from "@/modules/rbac/action";
import { saveGstRegistration } from "./gst.service";
import { updateNumberSeries } from "./number-series.service";
import { companyProfileSchema, gstRegistrationSchema, numberSeriesSchema } from "./settings.schemas";
import { updateCompanyProfile } from "./settings.service";

export const saveCompanyProfileAction = defineAction(
  { permission: "settings.update", schema: companyProfileSchema },
  async (input, ctx) => {
    await updateCompanyProfile(ctx, input);
    refresh();
  },
);

export const saveGstRegistrationAction = defineAction(
  { permission: "settings.update", schema: gstRegistrationSchema },
  async (input, ctx) => {
    await saveGstRegistration(ctx, input);
    refresh();
  },
);

export const saveNumberSeriesAction = defineAction(
  { permission: "settings.update", schema: numberSeriesSchema },
  async (input, ctx) => {
    await updateNumberSeries(ctx, input);
    refresh();
  },
);

/** Upload a logo (FormData with "file"). Returns the new FileAsset id; saving the profile links it. */
export async function uploadLogoAction(formData: FormData): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    if (!can(user.access, "settings.update")) return { ok: false, error: "You don't have permission to do this." };
    const file = z.instanceof(File).safeParse(formData.get("file"));
    if (!file.success || file.data.size === 0) return { ok: false, error: "Choose an image to upload." };
    const asset = await saveUpload(
      { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) },
      file.data,
      { allowed: IMAGE_TYPES, maxBytes: 2 * 1024 * 1024, isPublic: true, folder: "branding" },
    );
    return { ok: true, data: { id: asset.id, url: `/api/files/${asset.id}` } };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[uploadLogo]", e);
    return { ok: false, error: "Upload failed. Please try again." };
  }
}
