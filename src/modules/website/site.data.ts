import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import type { PageKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { placementStat } from "@/modules/academics/academic-logic";
import { getCompanyProfile, getDefaultOrganizationId } from "@/modules/settings/settings.service";
import { imageIdsIn } from "./fields";
import { readSection, SECTIONS, isSectionType } from "./sections";
import { readSiteSettings, SITE_KEY } from "./site-settings";

/**
 * Public website data. Everything here is cached ("use cache") and tagged "site"; any CMS change calls
 * revalidateSite() so visitors see it straight away. Only published content is read.
 */
export const SITE_TAG = "site";

export function revalidateSite() {
  try {
    updateTag(SITE_TAG);
  } catch (e) {
    // Outside a server action (tests, seed scripts) there is no cache to refresh.
    if (!(e instanceof Error) || !e.message.includes("within a Server Action")) throw e;
  }
}

export type Img = { url: string; alt: string; width: number | null; height: number | null };

const fileUrl = (id: string) => `/api/files/${id}`;

async function imagesById(ids: (string | null | undefined)[]): Promise<Record<string, Img>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return {};
  const files = await db.fileAsset.findMany({
    where: { id: { in: list }, isPublic: true, deletedAt: null },
    select: { id: true, altText: true, width: true, height: true, originalName: true },
  });
  return Object.fromEntries(
    files.map((f) => [f.id, { url: fileUrl(f.id), alt: f.altText ?? "", width: f.width, height: f.height }]),
  );
}

const markdown = (v: unknown) => (typeof v === "string" ? v : "");

/** Header, footer, banners, contact details: everything the public layout needs. */
export async function getSiteChrome() {
  "use cache";
  cacheTag(SITE_TAG, "organization");
  cacheLife("days"); // the copyright year below

  const orgId = await getDefaultOrganizationId();
  if (!orgId) return null;
  const [company, setting, menu, banners, branches] = await Promise.all([
    getCompanyProfile(orgId),
    db.setting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } } }),
    db.menuItem.findMany({
      where: { organizationId: orgId, isVisible: true },
      include: { page: { select: { kind: true, slug: true, status: true, deletedAt: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    db.banner.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { startsAt: "desc" },
      take: 20,
    }),
    db.branch.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true, showOnWebsite: true },
      select: { id: true, name: true, kind: true, city: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const site = readSiteSettings(setting?.value);
  const toLink = (m: (typeof menu)[number]) => {
    if (m.page) {
      if (m.page.deletedAt || (m.page.kind === "CUSTOM" && m.page.status !== "PUBLISHED")) return null;
      return m.page.kind === "HOME" ? "/" : `/${m.page.slug}`;
    }
    return m.url || null;
  };
  const items = menu
    .map((m) => ({
      id: m.id,
      parentId: m.parentId,
      location: m.location,
      label: m.label,
      href: toLink(m),
      newTab: m.openInNewTab,
    }))
    .filter((m): m is typeof m & { href: string } => !!m.href);
  const tree = (location: "HEADER" | "FOOTER") =>
    items
      .filter((m) => m.location === location && !m.parentId)
      .map((m) => ({ ...m, children: items.filter((c) => c.parentId === m.id) }));
  return {
    company,
    site,
    year: new Date().getFullYear(),
    header: tree("HEADER"),
    footer: tree("FOOTER"),
    banners: banners.map((b) => ({
      id: b.id,
      placement: b.placement,
      title: b.title,
      message: b.message,
      linkUrl: b.linkUrl,
      linkLabel: b.linkLabel,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt?.toISOString() ?? null,
    })),
    /** For the enquiry / booking forms. */
    branches: branches.map((b) => ({
      value: b.id,
      label: `${b.name}${b.city && b.city !== b.name ? `, ${b.city}` : ""}`,
      kind: b.kind,
    })),
    whatsapp: site.whatsapp.enabled ? site.whatsapp.number || site.contact.phone || company.phone || "" : "",
    phone: site.contact.phone || company.phone || "",
    email: site.contact.email || company.email || "",
    address:
      site.contact.address ||
      [company.addressLine1, company.addressLine2, company.city, company.state, company.pincode]
        .filter(Boolean)
        .join(", "),
  };
}
export type SiteChrome = NonNullable<Awaited<ReturnType<typeof getSiteChrome>>>;

export type RenderSection = { id: string; type: string; content: Record<string, unknown> };

/** Draft sections → renderable (for the signed-in preview; not cached). */
export async function previewSections(rows: { id: string; type: string; draftContent: unknown }[]) {
  return renderableSections(rows.map((r) => ({ id: r.id, type: r.type, content: r.draftContent })));
}

async function renderableSections(
  rows: { id: string; type: string; content: unknown }[],
): Promise<{ sections: RenderSection[]; images: Record<string, Img> }> {
  const sections: RenderSection[] = [];
  const ids: string[] = [];
  for (const r of rows) {
    const content = readSection(r.type, r.content);
    if (!content || !isSectionType(r.type)) continue;
    sections.push({ id: r.id, type: r.type, content });
    ids.push(...imageIdsIn(SECTIONS[r.type].fields, content));
  }
  return { sections, images: await imagesById(ids) };
}

/** A published page by slug ("" = home). System pages exist even before anything is published. */
export async function getPublishedPage(slug: string) {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("max");
  const orgId = await getDefaultOrganizationId();
  if (!orgId) return null;
  const page = await db.page.findFirst({
    where: { organizationId: orgId, slug, deletedAt: null },
    include: {
      sections: {
        where: { publishedSortOrder: { not: null }, publishedVisible: true },
        orderBy: { publishedSortOrder: "asc" },
      },
    },
  });
  if (!page) return null;
  if (page.kind === "CUSTOM" && page.status !== "PUBLISHED") return null;
  const { sections, images } = await renderableSections(
    page.sections
      .filter((s) => s.publishedContent !== null)
      .map((s) => ({ id: s.id, type: s.type, content: s.publishedContent })),
  );
  const og = await imagesById([page.ogImageId]);
  return {
    id: page.id,
    kind: page.kind,
    slug: page.slug,
    title: page.title,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    ogImage: page.ogImageId ? (og[page.ogImageId] ?? null) : null,
    sections,
    images,
  };
}
export type PublicPage = NonNullable<Awaited<ReturnType<typeof getPublishedPage>>>;

export async function getPublishedPageByKind(kind: PageKind) {
  const slug = kind === "HOME" ? "" : kind.toLowerCase();
  return getPublishedPage(slug);
}

/** All published lists the sections and system pages draw from (small datasets, cached together). */
export async function getSiteCollections() {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("max");
  const orgId = await getDefaultOrganizationId();
  if (!orgId) return null;
  const [courses, services, testimonials, stories, companies, gallery, faqs, branches] = await Promise.all([
    db.course.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true, showOnWebsite: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { modules: { orderBy: { sortOrder: "asc" }, select: { title: true, hours: true } } },
    }),
    db.serviceOffering.findMany({
      where: { organizationId: orgId, isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    db.testimonial.findMany({
      where: { organizationId: orgId, isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.successStory.findMany({
      where: { organizationId: orgId, isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { studentName: "asc" }],
    }),
    db.company.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true, showOnWebsite: true, logoId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoId: true, website: true },
    }),
    db.galleryItem.findMany({
      where: { organizationId: orgId, isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
      take: 200,
    }),
    db.faq.findMany({
      where: { organizationId: orgId, isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    }),
    db.branch.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true, showOnWebsite: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        pincode: true,
        phone: true,
        email: true,
        mapUrl: true,
        workingHours: true,
      },
    }),
  ]);
  const images = await imagesById([
    ...courses.map((c) => c.imageId),
    ...services.map((s) => s.imageId),
    ...testimonials.map((t) => t.photoId),
    ...stories.map((s) => s.photoId),
    ...companies.map((c) => c.logoId),
    ...gallery.map((g) => g.fileId),
  ]);
  const img = (id: string | null) => (id ? (images[id] ?? null) : null);
  return {
    courses: courses.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      code: c.code,
      duration: `${c.durationValue} ${c.durationUnit.toLowerCase().replace(/s$/, "")}${c.durationValue === 1 ? "" : "s"}`,
      fee: c.showFeeOnWebsite ? Number(c.fee) : null,
      gstMode: c.gstMode,
      shortDescription: c.shortDescription,
      description: markdown(c.description),
      eligibility: c.eligibility,
      featured: c.isFeatured,
      image: img(c.imageId),
      modules: c.modules,
      seoTitle: c.seoTitle,
      seoDescription: c.seoDescription,
    })),
    services: services.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      description: markdown(s.description),
      icon: s.iconName,
      image: img(s.imageId),
      startingPrice: s.startingPrice ? Number(s.startingPrice) : null,
      featured: s.isFeatured,
      deviceTypeId: s.deviceTypeId,
      seoTitle: s.seoTitle,
      seoDescription: s.seoDescription,
    })),
    testimonials: testimonials.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      quote: t.quote,
      rating: t.rating,
      photo: img(t.photoId),
      videoUrl: t.videoUrl,
    })),
    stories: stories.map((s) => ({
      id: s.id,
      studentName: s.studentName,
      companyName: s.companyName,
      courseName: s.courseName,
      designation: s.designation,
      packageText: s.packageText,
      quote: s.quote,
      photo: img(s.photoId),
    })),
    companies: companies.map((c) => ({ id: c.id, name: c.name, website: c.website, logo: img(c.logoId) })),
    gallery: gallery
      .map((g) => ({ id: g.id, caption: g.caption, album: g.album, image: img(g.fileId) }))
      .filter((g): g is typeof g & { image: Img } => !!g.image),
    faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer, category: f.category })),
    branches: branches.map((b) => ({
      ...b,
      address: [b.addressLine1, b.addressLine2, b.city, b.pincode].filter(Boolean).join(", "),
      hours: typeof b.workingHours === "string" ? b.workingHours : null,
    })),
  };
}
export type SiteCollections = NonNullable<Awaited<ReturnType<typeof getSiteCollections>>>;

/** Pages for the sitemap. */
export async function getSitemapEntries() {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("max");
  const orgId = await getDefaultOrganizationId();
  if (!orgId) return [];
  const [pages, courses, services] = await Promise.all([
    db.page.findMany({
      where: { organizationId: orgId, deletedAt: null, OR: [{ kind: { not: "CUSTOM" } }, { status: "PUBLISHED" }] },
      select: { slug: true, updatedAt: true },
    }),
    db.course.findMany({
      where: { organizationId: orgId, deletedAt: null, isActive: true, showOnWebsite: true },
      select: { slug: true, updatedAt: true },
    }),
    db.serviceOffering.findMany({ where: { organizationId: orgId, isPublished: true }, select: { slug: true } }),
  ]);
  return [
    ...pages.map((p) => ({ path: p.slug ? `/${p.slug}` : "/", updatedAt: p.updatedAt })),
    ...courses.map((c) => ({ path: `/courses/${c.slug}`, updatedAt: c.updatedAt })),
    ...services.map((s) => ({ path: `/services/${s.slug}`, updatedAt: null })),
    { path: "/enquire", updatedAt: null },
    { path: "/book-repair", updatedAt: null },
    { path: "/track", updatedAt: null },
  ];
}

/** Device types for the repair booking form. */
export async function getBookingOptions() {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("max");
  const orgId = await getDefaultOrganizationId();
  if (!orgId) return { deviceTypes: [] };
  const deviceTypes = await db.deviceType.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return { deviceTypes: deviceTypes.map((d) => ({ value: d.id, label: d.name })) };
}

/** Live placement figures for the Placements page, only when switched on in Site settings. */
export async function getPlacementFigures() {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("hours");
  const orgId = await getDefaultOrganizationId();
  if (!orgId) return null;
  const setting = await db.setting.findUnique({
    where: { organizationId_key: { organizationId: orgId, key: SITE_KEY } },
  });
  if (!readSiteSettings(setting?.value).placements.showFigures) return null;
  const rows = await db.enrollment.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      status: true,
      placementOptOut: true,
      applications: { where: { offer: { joiningStatus: { not: "DECLINED" } } }, select: { id: true } },
    },
  });
  const stat = placementStat(
    rows.map((r) => ({ status: r.status, placementOptOut: r.placementOptOut, placed: r.applications.length > 0 })),
  );
  const hiring = await db.company.count({
    where: {
      organizationId: orgId,
      deletedAt: null,
      drives: { some: { applications: { some: { offer: { joiningStatus: { not: "DECLINED" } } } } } },
    },
  });
  return stat.placed > 0 ? { ...stat, hiring } : null;
}
