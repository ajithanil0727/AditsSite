import "server-only";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import type { ContentDef } from "./content-registry";
import { pagePath, readSection, SECTIONS, isSectionType } from "./sections";
import { readSiteSettings, SITE_KEY } from "./site-settings";
import type { Option } from "./fields";

const plain = <T>(v: T) => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function listPages(orgId: string) {
  const pages = await db.page.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { sections: true },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
  });
  return pages.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    path: pagePath(p.kind, p.slug),
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    sections: p.sections.filter((s) => !s.deletedAt).length,
    hasDraftChanges: p.sections.some(sectionChanged),
  }));
}

function sectionChanged(s: {
  deletedAt: Date | null;
  publishedSortOrder: number | null;
  sortOrder: number;
  isVisible: boolean;
  publishedVisible: boolean;
  draftContent: unknown;
  publishedContent: unknown;
}) {
  if (s.deletedAt) return s.publishedSortOrder !== null;
  return (
    s.publishedSortOrder === null ||
    s.publishedSortOrder !== s.sortOrder ||
    s.isVisible !== s.publishedVisible ||
    !same(s.draftContent, s.publishedContent)
  );
}

export async function getPageForEditor(orgId: string, id: string) {
  const page = await db.page.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: { sections: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!page) return null;
  const live = page.sections.filter((s) => !s.deletedAt);
  return {
    id: page.id,
    kind: page.kind,
    slug: page.slug,
    title: page.title,
    path: pagePath(page.kind, page.slug),
    status: page.status,
    seoTitle: page.seoTitle ?? "",
    seoDescription: page.seoDescription ?? "",
    ogImageId: page.ogImageId,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    hasDraftChanges: page.sections.some(sectionChanged),
    sections: live.map((s) => ({
      id: s.id,
      type: s.type,
      label: isSectionType(s.type) ? SECTIONS[s.type].label : s.type,
      isVisible: s.isVisible,
      content: plain(readSection(s.type, s.draftContent) ?? {}),
      isNew: s.publishedSortOrder === null,
      changed: sectionChanged(s),
    })),
  };
}
export type EditorPage = NonNullable<Awaited<ReturnType<typeof getPageForEditor>>>;

/** Draft sections for the preview (signed-in editors only). */
export async function getDraftPage(orgId: string, id: string) {
  const page = await db.page.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: {
      sections: { where: { deletedAt: null, isVisible: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  return page;
}

export async function listMenu(orgId: string) {
  const items = await db.menuItem.findMany({
    where: { organizationId: orgId },
    include: { page: { select: { title: true, kind: true, slug: true, status: true } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return items.map((m) => ({
    id: m.id,
    location: m.location,
    label: m.label,
    parentId: m.parentId,
    pageId: m.pageId,
    url: m.url ?? "",
    target: m.page ? `${m.page.title} (${pagePath(m.page.kind, m.page.slug)})` : (m.url ?? ""),
    pageDraft: m.page?.kind === "CUSTOM" && m.page.status !== "PUBLISHED",
    isVisible: m.isVisible,
    openInNewTab: m.openInNewTab,
  }));
}

export async function getSiteSettingsForEditor(orgId: string) {
  const row = await db.setting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } } });
  return readSiteSettings(row?.value);
}

// ------------------------------------------------------------------ content lists

const ymd = (d: unknown) =>
  d instanceof Date ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10) : null;

export async function listContent(orgId: string, def: ContentDef, q: string) {
  const title = def.columns[0];
  const searchable = def.fields.find((f) => f.name === title)?.type === "image" ? def.columns[1] : title;
  const rows = await (db as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>)[
    def.model
  ].findMany({
    where: {
      organizationId: orgId,
      ...(def.softDelete ? { deletedAt: null } : {}),
      ...(q ? { [searchable]: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: def.orderBy,
    take: 500,
  });
  return rows.map((r) => {
    const out: Record<string, unknown> & { id: string } = { id: String(r.id) };
    for (const f of def.fields) {
      const v = r[f.name];
      if (f.type === "date") out[f.name] = ymd(v);
      else if (f.type === "number") out[f.name] = v === null || v === undefined ? "" : Number(v);
      else if (f.type === "markdown") out[f.name] = typeof v === "string" ? v : "";
      else out[f.name] = v ?? (f.type === "switch" ? false : f.type === "image" || f.type === "ref" ? null : "");
    }
    return out;
  });
}

export async function contentRefOptions(orgId: string, def: ContentDef) {
  const out: Record<string, Option[]> = {};
  for (const f of def.fields) {
    if (f.type !== "ref") continue;
    if (f.ref === "branch") {
      const list = await db.branch.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      });
      out[f.name] = list.map((b) => ({ value: b.id, label: b.name }));
    } else {
      const list = await db.deviceType.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: "asc" } });
      out[f.name] = list.map((d) => ({ value: d.id, label: d.name }));
    }
  }
  return out;
}

// ------------------------------------------------------------------ media

export async function listMedia(orgId: string, p: ListParams) {
  const where = {
    organizationId: orgId,
    isPublic: true,
    deletedAt: null,
    mimeType: { startsWith: "image/" },
    ...(p.filters.folder ? { folder: p.filters.folder } : {}),
    ...(p.q
      ? {
          OR: [
            { originalName: { contains: p.q, mode: "insensitive" as const } },
            { altText: { contains: p.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total, folders] = await Promise.all([
    db.fileAsset.findMany({ where, orderBy: { createdAt: "desc" }, ...paging(p) }),
    db.fileAsset.count({ where }),
    db.fileAsset.findMany({
      where: { organizationId: orgId, isPublic: true, deletedAt: null, folder: { not: null } },
      distinct: ["folder"],
      select: { folder: true },
      orderBy: { folder: "asc" },
    }),
  ]);
  return {
    total,
    folders: folders.map((f) => f.folder!).filter(Boolean),
    rows: rows.map(mediaView),
  };
}

export function mediaView(f: {
  id: string;
  originalName: string;
  altText: string | null;
  folder: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: Date;
}) {
  return {
    id: f.id,
    url: `/api/files/${f.id}`,
    name: f.originalName,
    altText: f.altText ?? "",
    folder: f.folder ?? "",
    width: f.width,
    height: f.height,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt.toISOString(),
  };
}
export type MediaItem = ReturnType<typeof mediaView>;

/** Details of the images currently picked in a form (preview thumbnails). */
export async function mediaByIds(orgId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.fileAsset.findMany({ where: { organizationId: orgId, id: { in: ids }, deletedAt: null } });
  return rows.map(mediaView);
}

export type CurrentEditor = Pick<CurrentUser, "organizationId">;
