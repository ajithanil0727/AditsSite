import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { slugify } from "@/modules/courses/courses.schemas";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { CONTENT, type ContentDef } from "./content-registry";
import { fieldsSchema, imageIdsIn, type CmsField } from "./fields";
import { isSectionType, RESERVED_SLUGS, SECTIONS, sectionSchema, SYSTEM_PAGES } from "./sections";
import { SITE_KEY, type menuItemSchema, type pageMetaSchema, type SiteSettings } from "./site-settings";

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ------------------------------------------------------------------ pages

/** Create the fixed system pages if they don't exist yet (idempotent; also used by the seed). */
export async function ensureSystemPages(tx: Tx | typeof db, orgId: string) {
  for (const p of SYSTEM_PAGES) {
    const existing = await tx.page.findUnique({
      where: { organizationId_slug: { organizationId: orgId, slug: p.slug } },
    });
    if (!existing) {
      await tx.page.create({
        data: { organizationId: orgId, kind: p.kind, slug: p.slug, title: p.title, status: "PUBLISHED" },
      });
    }
  }
}

async function loadPage(tx: Tx | typeof db, orgId: string, id: string) {
  const page = await tx.page.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
  if (!page) throw new ActionError("Page not found.");
  return page;
}

export async function savePageMeta(ctx: ActionContext, input: z.output<typeof pageMetaSchema>) {
  const orgId = ctx.user.organizationId;
  return db.$transaction(async (tx) => {
    if (input.ogImageId) await assertPublicImage(tx, orgId, input.ogImageId);
    if (!input.id) {
      const slug = input.slug || slugify(input.title);
      if (!slug || RESERVED_SLUGS.has(slug))
        throw new ActionError("That web address is taken by the system. Pick another.");
      const page = await tx.page.create({
        data: {
          organizationId: orgId,
          kind: "CUSTOM",
          slug,
          title: input.title,
          status: "DRAFT",
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          ogImageId: input.ogImageId,
        },
      });
      await tx.pageSection.create({
        data: { pageId: page.id, type: "richText", sortOrder: 0, draftContent: json({ title: input.title, body: "" }) },
      });
      await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Page", entityId: page.id, after: page });
      return page.id;
    }
    const before = await loadPage(tx, orgId, input.id);
    let slug = before.slug;
    if (before.kind === "CUSTOM") {
      slug = input.slug || slugify(input.title);
      if (!slug || RESERVED_SLUGS.has(slug))
        throw new ActionError("That web address is taken by the system. Pick another.");
    }
    const after = await tx.page.update({
      where: { id: before.id },
      data: {
        title: input.title,
        slug,
        seoTitle: input.seoTitle || null,
        seoDescription: input.seoDescription || null,
        ogImageId: input.ogImageId,
      },
    });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Page", entityId: before.id, before, after });
    return before.id;
  });
}

export async function deletePage(ctx: ActionContext, id: string) {
  await db.$transaction(async (tx) => {
    const page = await loadPage(tx, ctx.user.organizationId, id);
    if (page.kind !== "CUSTOM") throw new ActionError("System pages can't be deleted. Hide their sections instead.");
    // Free the slug so a new page can use it.
    await tx.page.update({
      where: { id },
      data: { deletedAt: new Date(), slug: `${page.slug}--deleted-${Date.now()}` },
    });
    await tx.menuItem.deleteMany({ where: { pageId: id } });
    await writeAudit(tx, ctx.actor, { action: "DELETE", entityType: "Page", entityId: id, before: page });
  });
}

// ------------------------------------------------------------------ sections (draft)

async function loadSection(tx: Tx | typeof db, orgId: string, id: string) {
  const s = await tx.pageSection.findFirst({
    where: { id, deletedAt: null, page: { organizationId: orgId, deletedAt: null } },
  });
  if (!s) throw new ActionError("Section not found.");
  return s;
}

export async function addSection(ctx: ActionContext, pageId: string, type: string) {
  if (!isSectionType(type)) throw new ActionError("Unknown section type.");
  return db.$transaction(async (tx) => {
    await loadPage(tx, ctx.user.organizationId, pageId);
    const last = await tx.pageSection.aggregate({ where: { pageId, deletedAt: null }, _max: { sortOrder: true } });
    const section = await tx.pageSection.create({
      data: { pageId, type, sortOrder: (last._max.sortOrder ?? -1) + 1, draftContent: json(SECTIONS[type].defaults) },
    });
    return section.id;
  });
}

export async function saveSection(ctx: ActionContext, id: string, content: unknown) {
  const orgId = ctx.user.organizationId;
  const section = await loadSection(db, orgId, id);
  if (!isSectionType(section.type)) throw new ActionError("Unknown section type.");
  const parsed = sectionSchema(section.type).safeParse(content);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the section fields.");
  await assertImagesIn(orgId, parsed.data, SECTIONS[section.type].fields);
  await db.pageSection.update({ where: { id }, data: { draftContent: json(parsed.data) } });
}

export async function moveSection(ctx: ActionContext, id: string, direction: "up" | "down") {
  await db.$transaction(async (tx) => {
    const s = await loadSection(tx, ctx.user.organizationId, id);
    const list = await tx.pageSection.findMany({
      where: { pageId: s.pageId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const i = list.findIndex((x) => x.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [idx, item] of list.entries()) {
      if (item.sortOrder !== idx) await tx.pageSection.update({ where: { id: item.id }, data: { sortOrder: idx } });
    }
  });
}

export async function setSectionVisible(ctx: ActionContext, id: string, visible: boolean) {
  await loadSection(db, ctx.user.organizationId, id);
  await db.pageSection.update({ where: { id }, data: { isVisible: visible } });
}

export async function removeSection(ctx: ActionContext, id: string) {
  const s = await loadSection(db, ctx.user.organizationId, id);
  // Never published: delete now. Published: mark removed; it disappears from the site on publish.
  if (s.publishedSortOrder === null) await db.pageSection.delete({ where: { id } });
  else await db.pageSection.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Copy the draft to the live site. */
export async function publishPage(ctx: ActionContext, pageId: string) {
  await db.$transaction(async (tx) => {
    const page = await loadPage(tx, ctx.user.organizationId, pageId);
    const sections = await tx.pageSection.findMany({
      where: { pageId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    let order = 0;
    for (const s of sections) {
      if (s.deletedAt) {
        await tx.pageSection.delete({ where: { id: s.id } });
        continue;
      }
      await tx.pageSection.update({
        where: { id: s.id },
        data: {
          sortOrder: order,
          publishedSortOrder: order,
          publishedVisible: s.isVisible,
          publishedContent: s.draftContent ?? json({}),
        },
      });
      order++;
    }
    await tx.page.update({ where: { id: pageId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Page",
      entityId: pageId,
      before: { status: page.status, publishedAt: page.publishedAt },
      after: { status: "PUBLISHED", publishedAt: new Date(), sections: order },
    });
  });
}

/** Throw away draft changes: go back to what is live. */
export async function discardDraft(ctx: ActionContext, pageId: string) {
  await db.$transaction(async (tx) => {
    await loadPage(tx, ctx.user.organizationId, pageId);
    const sections = await tx.pageSection.findMany({ where: { pageId } });
    for (const s of sections) {
      if (s.publishedSortOrder === null) await tx.pageSection.delete({ where: { id: s.id } });
      else
        await tx.pageSection.update({
          where: { id: s.id },
          data: {
            deletedAt: null,
            sortOrder: s.publishedSortOrder,
            isVisible: s.publishedVisible,
            draftContent: s.publishedContent ?? json({}),
          },
        });
    }
  });
}

/** Take a custom page off the site (system pages are always on). */
export async function unpublishPage(ctx: ActionContext, pageId: string) {
  await db.$transaction(async (tx) => {
    const page = await loadPage(tx, ctx.user.organizationId, pageId);
    if (page.kind !== "CUSTOM") throw new ActionError("System pages are always on the site.");
    await tx.page.update({ where: { id: pageId }, data: { status: "DRAFT" } });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Page",
      entityId: pageId,
      before: { status: page.status },
      after: { status: "DRAFT" },
    });
  });
}

// ------------------------------------------------------------------ menus

export async function saveMenuItem(ctx: ActionContext, input: z.output<typeof menuItemSchema>) {
  const orgId = ctx.user.organizationId;
  if (!input.pageId && !input.url) throw new ActionError("Pick a page or enter a link.");
  if (input.pageId) await loadPage(db, orgId, input.pageId);
  if (input.parentId) {
    const parent = await db.menuItem.findFirst({
      where: { id: input.parentId, organizationId: orgId, parentId: null },
    });
    if (!parent || parent.location !== input.location) throw new ActionError("Pick a top-level item in the same menu.");
    if (parent.id === input.id) throw new ActionError("An item can't be inside itself.");
  }
  const data = {
    location: input.location,
    label: input.label,
    pageId: input.pageId,
    url: input.pageId ? null : input.url,
    parentId: input.parentId,
    isVisible: input.isVisible,
    openInNewTab: input.openInNewTab,
  };
  if (input.id) {
    const before = await db.menuItem.findFirst({ where: { id: input.id, organizationId: orgId } });
    if (!before) throw new ActionError("Menu item not found.");
    if (input.parentId && (await db.menuItem.count({ where: { parentId: input.id } })) > 0)
      throw new ActionError("This item has its own sub-items, so it can't go inside another.");
    await db.menuItem.update({ where: { id: input.id }, data });
    return;
  }
  const last = await db.menuItem.aggregate({
    where: { organizationId: orgId, location: input.location, parentId: input.parentId },
    _max: { sortOrder: true },
  });
  await db.menuItem.create({ data: { ...data, organizationId: orgId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function moveMenuItem(ctx: ActionContext, id: string, direction: "up" | "down") {
  await db.$transaction(async (tx) => {
    const item = await tx.menuItem.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
    if (!item) throw new ActionError("Menu item not found.");
    const list = await tx.menuItem.findMany({
      where: { organizationId: item.organizationId, location: item.location, parentId: item.parentId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const i = list.findIndex((x) => x.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [idx, m] of list.entries())
      if (m.sortOrder !== idx) await tx.menuItem.update({ where: { id: m.id }, data: { sortOrder: idx } });
  });
}

export async function deleteMenuItem(ctx: ActionContext, id: string) {
  const item = await db.menuItem.findFirst({ where: { id, organizationId: ctx.user.organizationId } });
  if (!item) throw new ActionError("Menu item not found.");
  await db.$transaction([db.menuItem.deleteMany({ where: { parentId: id } }), db.menuItem.delete({ where: { id } })]);
}

// ------------------------------------------------------------------ site settings

export async function saveSiteSettings(ctx: ActionContext, input: SiteSettings) {
  const orgId = ctx.user.organizationId;
  if (input.seo.ogImageId) await assertPublicImage(db, orgId, input.seo.ogImageId);
  await db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } },
    });
    await tx.setting.upsert({
      where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } },
      create: { organizationId: orgId, key: SITE_KEY, value: json(input) },
      update: { value: json(input) },
    });
    await writeAudit(tx, ctx.actor, {
      action: before ? "UPDATE" : "CREATE",
      entityType: "Setting",
      entityId: SITE_KEY,
      before: before?.value,
      after: input,
    });
  });
}

// ------------------------------------------------------------------ content lists

type Delegate = {
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
};
const delegate = (client: unknown, def: ContentDef) => (client as Record<string, Delegate>)[def.model];

const IST_MIDNIGHT = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const IST_END_OF_DAY = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);

/** Form values → DB data (markdown into Json, dates into IST instants, slugs). */
async function toData(def: ContentDef, values: Record<string, unknown>, orgId: string, id?: string) {
  const data: Record<string, unknown> = { ...values };
  for (const f of def.fields) {
    const v = values[f.name];
    if (f.type === "markdown" && def.model === "serviceOffering") data[f.name] = v ? json(v) : null;
    if (f.type === "date")
      data[f.name] = v ? (f.name === "endsAt" ? IST_END_OF_DAY(String(v)) : IST_MIDNIGHT(String(v))) : null;
    if ((f.type === "text" || f.type === "url" || f.type === "textarea") && !f.required && v === "")
      data[f.name] = null;
  }
  if (def.model === "serviceOffering") {
    const slug = (values.slug as string) || slugify(String(values.title));
    const clash = await db.serviceOffering.findFirst({
      where: { organizationId: orgId, slug, ...(id ? { id: { not: id } } : {}) },
    });
    if (clash) throw new ActionError("Another service already uses this web address.");
    data.slug = slug;
  }
  if (def.model === "banner" && data.endsAt && (data.endsAt as Date) < (data.startsAt as Date))
    throw new ActionError("'Show until' must be on or after 'Show from'.");
  return data;
}

export async function saveContent(ctx: ActionContext, def: ContentDef, raw: unknown) {
  const orgId = ctx.user.organizationId;
  const parsed = fieldsSchema(def.fields).safeParse(raw);
  if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the fields.");
  const id = typeof (raw as { id?: unknown })?.id === "string" ? ((raw as { id: string }).id as string) : undefined;
  const values = parsed.data as Record<string, unknown>;
  await assertImagesIn(orgId, values, def.fields);
  if (typeof values.branchId === "string" && values.branchId) {
    const b = await db.branch.findFirst({ where: { id: values.branchId, organizationId: orgId, deletedAt: null } });
    if (!b || !canAccessBranch(ctx.user.access, def.permission, b.id)) throw new ActionError("Branch not found.");
  }
  if (typeof values.deviceTypeId === "string" && values.deviceTypeId) {
    const d = await db.deviceType.findFirst({ where: { id: values.deviceTypeId, organizationId: orgId } });
    if (!d) throw new ActionError("Device type not found.");
  }
  const data = await toData(def, values, orgId, id);
  await db.$transaction(async (tx) => {
    const d = delegate(tx, def);
    if (!id) {
      const created = await d.create({ data: { ...data, organizationId: orgId } });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: def.model,
        entityId: String(created.id),
        after: created,
      });
      return;
    }
    const before = await d.findFirst({
      where: { id, organizationId: orgId, ...(def.softDelete ? { deletedAt: null } : {}) },
    });
    if (!before) throw new ActionError(`That ${def.singular} no longer exists.`);
    const after = await d.update({ where: { id }, data });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: def.model, entityId: id, before, after });
  });
}

export async function deleteContent(ctx: ActionContext, def: ContentDef, id: string) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const d = delegate(tx, def);
    const before = await d.findFirst({ where: { id, organizationId: orgId } });
    if (!before) throw new ActionError(`That ${def.singular} no longer exists.`);
    if (def.softDelete) await d.update({ where: { id }, data: { deletedAt: new Date() } });
    else await d.delete({ where: { id } });
    await writeAudit(tx, ctx.actor, { action: "DELETE", entityType: def.model, entityId: id, before });
  });
}

export function contentDef(kind: keyof typeof CONTENT) {
  return CONTENT[kind];
}

// ------------------------------------------------------------------ media

async function assertPublicImage(tx: Tx | typeof db, orgId: string, id: string) {
  const f = await tx.fileAsset.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
  if (!f || !f.mimeType.startsWith("image/")) throw new ActionError("Pick an image from the media library.");
  if (!f.isPublic) throw new ActionError("That image is private and can't be used on the website.");
}

/** Every image id in a CMS value must be a public image of this organisation. */
async function assertImagesIn(orgId: string, values: Record<string, unknown>, fields: CmsField[]) {
  for (const id of new Set(imageIdsIn(fields, values))) await assertPublicImage(db, orgId, id);
}

export async function updateMedia(
  ctx: ActionContext,
  input: { id: string; altText: string | null; folder: string | null },
) {
  const f = await db.fileAsset.findFirst({
    where: { id: input.id, organizationId: ctx.user.organizationId, deletedAt: null, isPublic: true },
  });
  if (!f) throw new ActionError("File not found.");
  const after = await db.fileAsset.update({
    where: { id: f.id },
    data: { altText: input.altText, folder: input.folder },
  });
  await writeAudit(db, ctx.actor, {
    action: "UPDATE",
    entityType: "FileAsset",
    entityId: f.id,
    before: { altText: f.altText, folder: f.folder },
    after: { altText: after.altText, folder: after.folder },
  });
}

/** Where an image is used (so it isn't deleted while a page still shows it). */
export async function mediaUsage(orgId: string, id: string): Promise<string[]> {
  const [courses, services, testimonials, stories, gallery, companies, pages, sections, setting] = await Promise.all([
    db.course.count({ where: { organizationId: orgId, imageId: id, deletedAt: null } }),
    db.serviceOffering.count({ where: { organizationId: orgId, imageId: id } }),
    db.testimonial.count({ where: { organizationId: orgId, photoId: id } }),
    db.successStory.count({ where: { organizationId: orgId, photoId: id } }),
    db.galleryItem.count({ where: { organizationId: orgId, fileId: id } }),
    db.company.count({ where: { organizationId: orgId, logoId: id, deletedAt: null } }),
    db.page.count({ where: { organizationId: orgId, ogImageId: id, deletedAt: null } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "PageSection" s JOIN "Page" p ON p.id = s."pageId"
      WHERE p."organizationId" = ${orgId} AND p."deletedAt" IS NULL
        AND (s."draftContent"::text LIKE ${`%"${id}"%`} OR COALESCE(s."publishedContent"::text, '') LIKE ${`%"${id}"%`})`,
    db.setting.count({
      where: { organizationId: orgId, key: { in: [SITE_KEY, "company"] }, value: { string_contains: id } as never },
    }),
  ]);
  const out: string[] = [];
  if (courses) out.push(`${courses} course(s)`);
  if (services) out.push(`${services} service(s)`);
  if (testimonials) out.push(`${testimonials} testimonial(s)`);
  if (stories) out.push(`${stories} success stor(ies)`);
  if (gallery) out.push("the gallery");
  if (companies) out.push(`${companies} company logo(s)`);
  if (pages) out.push(`${pages} page share image(s)`);
  if (Number(sections[0]?.n ?? 0)) out.push(`${sections[0].n} page section(s)`);
  if (setting) out.push("site settings / logo");
  return out;
}

export async function deleteMedia(ctx: ActionContext, id: string) {
  const orgId = ctx.user.organizationId;
  const f = await db.fileAsset.findFirst({ where: { id, organizationId: orgId, deletedAt: null, isPublic: true } });
  if (!f) throw new ActionError("File not found.");
  const used = await mediaUsage(orgId, id);
  if (used.length) throw new ActionError(`Still used in ${used.join(", ")}. Remove it there first.`);
  await db.fileAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(db, ctx.actor, { action: "DELETE", entityType: "FileAsset", entityId: id, before: f });
}
