"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseListParams } from "@/lib/list-params";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { IMAGE_TYPES, saveUpload } from "@/modules/files/files.service";
import { can } from "@/modules/rbac/access";
import { ActionError, defineAction, type ActionResult } from "@/modules/rbac/action";
import { CONTENT_KINDS, CONTENT } from "./content-registry";
import { db } from "@/lib/db";
import { revalidateSite } from "./site.data";
import { menuItemSchema, pageMetaSchema, siteSettingsSchema } from "./site-settings";
import { listMedia, mediaByIds, mediaView } from "./website.queries";
import {
  addSection,
  deleteContent,
  deleteMedia,
  deleteMenuItem,
  deletePage,
  discardDraft,
  moveMenuItem,
  moveSection,
  publishPage,
  removeSection,
  saveContent,
  saveMenuItem,
  savePageMeta,
  saveSection,
  saveSiteSettings,
  setSectionVisible,
  unpublishPage,
  updateMedia,
} from "./website.service";

/** Draft edits only refresh the admin screen; anything that changes the live site also revalidates it. */
const draft = <T>(r: T) => {
  refresh();
  return r;
};
const live = <T>(r: T) => {
  revalidateSite();
  refresh();
  return r;
};

const id = z.object({ id: z.string().min(1) });
const dir = z.object({ id: z.string().min(1), direction: z.enum(["up", "down"]) });

// ---------------------------------------------------------------- pages

export const savePageMetaAction = defineAction(
  { permission: "website.edit", schema: pageMetaSchema },
  async (i, ctx) => {
    const pageId = await savePageMeta(ctx, i);
    revalidateSite();
    if (!i.id) redirect(`/admin/website/pages/${pageId}`);
    refresh();
    return pageId;
  },
);

export const deletePageAction = defineAction({ permission: "website.edit", schema: id }, async (i, ctx) => {
  await deletePage(ctx, i.id);
  revalidateSite();
  redirect("/admin/website/pages");
});

export const addSectionAction = defineAction(
  { permission: "website.edit", schema: z.object({ pageId: z.string().min(1), type: z.string().min(1) }) },
  async (i, ctx) => draft(await addSection(ctx, i.pageId, i.type)),
);
export const saveSectionAction = defineAction(
  { permission: "website.edit", schema: z.object({ id: z.string().min(1), content: z.unknown() }) },
  async (i, ctx) => draft(await saveSection(ctx, i.id, i.content)),
);
export const moveSectionAction = defineAction({ permission: "website.edit", schema: dir }, async (i, ctx) =>
  draft(await moveSection(ctx, i.id, i.direction)),
);
export const setSectionVisibleAction = defineAction(
  { permission: "website.edit", schema: z.object({ id: z.string().min(1), visible: z.boolean() }) },
  async (i, ctx) => draft(await setSectionVisible(ctx, i.id, i.visible)),
);
export const removeSectionAction = defineAction({ permission: "website.edit", schema: id }, async (i, ctx) =>
  draft(await removeSection(ctx, i.id)),
);
export const discardDraftAction = defineAction({ permission: "website.edit", schema: id }, async (i, ctx) =>
  draft(await discardDraft(ctx, i.id)),
);
export const publishPageAction = defineAction({ permission: "website.publish", schema: id }, async (i, ctx) =>
  live(await publishPage(ctx, i.id)),
);
export const unpublishPageAction = defineAction({ permission: "website.publish", schema: id }, async (i, ctx) =>
  live(await unpublishPage(ctx, i.id)),
);

// ---------------------------------------------------------------- menus & settings

export const saveMenuItemAction = defineAction({ permission: "website.edit", schema: menuItemSchema }, async (i, ctx) =>
  live(await saveMenuItem(ctx, i)),
);
export const moveMenuItemAction = defineAction({ permission: "website.edit", schema: dir }, async (i, ctx) =>
  live(await moveMenuItem(ctx, i.id, i.direction)),
);
export const deleteMenuItemAction = defineAction({ permission: "website.edit", schema: id }, async (i, ctx) =>
  live(await deleteMenuItem(ctx, i.id)),
);
export const saveSiteSettingsAction = defineAction(
  { permission: "website.edit", schema: siteSettingsSchema },
  async (i, ctx) => live(await saveSiteSettings(ctx, i)),
);

// ---------------------------------------------------------------- content lists

const contentInput = z.object({ kind: z.enum(CONTENT_KINDS), values: z.record(z.string(), z.unknown()) });

export const saveContentAction = defineAction(
  { permission: (i) => CONTENT[i.kind].permission, schema: contentInput },
  async (i, ctx) => live(await saveContent(ctx, CONTENT[i.kind], i.values)),
);
export const deleteContentAction = defineAction(
  {
    permission: (i) => CONTENT[i.kind].permission,
    schema: z.object({ kind: z.enum(CONTENT_KINDS), id: z.string().min(1) }),
  },
  async (i, ctx) => live(await deleteContent(ctx, CONTENT[i.kind], i.id)),
);

// ---------------------------------------------------------------- media

const MEDIA_PERMS = ["media.manage", "website.edit", "companies.manage"] as const;
const canUseMedia = (access: Parameters<typeof can>[0]) => MEDIA_PERMS.some((p) => can(access, p));

/** Upload a website image (FormData: file, alt, folder, width, height). Already cropped on the client. */
export async function uploadMediaAction(formData: FormData): Promise<ActionResult<ReturnType<typeof mediaView>>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    if (!canUseMedia(user.access)) return { ok: false, error: "You don't have permission to do this." };
    const file = z.instanceof(File).safeParse(formData.get("file"));
    if (!file.success || file.data.size === 0) return { ok: false, error: "Choose an image to upload." };
    const meta = z
      .object({
        alt: z.string().trim().max(200).optional().default(""),
        folder: z.string().trim().max(60).optional().default(""),
        width: z.coerce.number().int().min(1).max(20_000).optional(),
        height: z.coerce.number().int().min(1).max(20_000).optional(),
      })
      .parse({
        alt: formData.get("alt") ?? undefined,
        folder: formData.get("folder") ?? undefined,
        width: formData.get("width") ?? undefined,
        height: formData.get("height") ?? undefined,
      });
    const asset = await saveUpload(
      { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) },
      file.data,
      { allowed: IMAGE_TYPES, maxBytes: 5 * 1024 * 1024, isPublic: true, folder: "website" },
    );
    const updated = await db.fileAsset.update({
      where: { id: asset.id },
      data: {
        altText: meta.alt || null,
        folder: meta.folder || "website",
        width: meta.width ?? null,
        height: meta.height ?? null,
      },
    });
    return { ok: true, data: mediaView(updated) };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[uploadMedia]", e);
    return { ok: false, error: "Upload failed. Please try again." };
  }
}

export const listMediaAction = defineAction(
  {
    permission: null,
    schema: z.object({
      q: z.string().max(100).optional(),
      folder: z.string().max(60).optional(),
      page: z.number().int().min(1).optional(),
    }),
  },
  async (i, ctx) => {
    if (!canUseMedia(ctx.user.access)) throw new ActionError("You don't have permission to do this.");
    return listMedia(
      ctx.user.organizationId,
      parseListParams({ q: i.q, page: String(i.page ?? 1), size: "50", ...(i.folder ? { f_folder: i.folder } : {}) }),
    );
  },
);

export const mediaByIdsAction = defineAction(
  { permission: null, schema: z.object({ ids: z.array(z.string()).max(50) }) },
  async (i, ctx) => mediaByIds(ctx.user.organizationId, i.ids),
);

export const updateMediaAction = defineAction(
  {
    permission: "media.manage",
    schema: z.object({
      id: z.string().min(1),
      altText: z
        .string()
        .trim()
        .max(200)
        .transform((v) => v || null),
      folder: z
        .string()
        .trim()
        .max(60)
        .transform((v) => v || null),
    }),
  },
  async (i, ctx) => live(await updateMedia(ctx, i)),
);

export const deleteMediaAction = defineAction({ permission: "media.manage", schema: id }, async (i, ctx) =>
  live(await deleteMedia(ctx, i.id)),
);
