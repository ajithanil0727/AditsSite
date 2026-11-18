import type { Metadata } from "next";
import type { PageKind } from "@/generated/prisma/enums";
import {
  getPublishedPageByKind,
  getSiteCollections,
  type PublicPage,
  type SiteCollections,
} from "@/modules/website/site.data";
import { SYSTEM_PAGES } from "@/modules/website/sections";
import { Reveal } from "./reveal";
import { PageTitle, Sections } from "./sections";

/** Page metadata from the content manager (SEO title, description, share image). */
export function pageMetadata(
  page: Pick<PublicPage, "title" | "seoTitle" | "seoDescription" | "ogImage"> | null,
  path: string,
  fallbackTitle: string,
): Metadata {
  return {
    title: page?.seoTitle || page?.title || fallbackTitle,
    description: page?.seoDescription || undefined,
    alternates: { canonical: path },
    openGraph: page?.ogImage ? { images: [{ url: page.ogImage.url, alt: page.ogImage.alt }] } : undefined,
  };
}

export async function systemPageMetadata(kind: Exclude<PageKind, "CUSTOM">): Promise<Metadata> {
  const def = SYSTEM_PAGES.find((p) => p.kind === kind)!;
  return pageMetadata(await getPublishedPageByKind(kind), def.path, def.title);
}

/**
 * A page made of CMS sections. If the first section isn't a hero, a simple title band is shown.
 * `children` is the page's built-in part (course list, contact form…), rendered after the sections.
 */
export function PageView({
  page,
  data,
  title,
  subtitle,
  children,
}: {
  page: PublicPage | null;
  data: SiteCollections;
  title: string;
  subtitle?: string | null;
  children?: React.ReactNode;
}) {
  const sections = page?.sections ?? [];
  const startsWithHero = sections[0]?.type === "hero";
  return (
    <Reveal>
      {!startsWithHero && <PageTitle title={page?.title || title} subtitle={subtitle} />}
      <Sections sections={sections} images={page?.images ?? {}} data={data} />
      {children}
    </Reveal>
  );
}

/** Load the page + collections for a system page. */
export async function loadSystemPage(kind: Exclude<PageKind, "CUSTOM">) {
  const [page, data] = await Promise.all([getPublishedPageByKind(kind), getSiteCollections()]);
  return { page, data: data ?? EMPTY };
}

export const EMPTY: SiteCollections = {
  courses: [],
  services: [],
  testimonials: [],
  stories: [],
  companies: [],
  gallery: [],
  faqs: [],
  branches: [],
};
