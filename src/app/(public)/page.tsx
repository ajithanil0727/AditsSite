import type { Metadata } from "next";
import { HomePopup } from "@/components/site/banners";
import { HomeMotion } from "@/components/site/home-motion";
import { loadSystemPage, pageMetadata } from "@/components/site/page-view";
import { Sections } from "@/components/site/sections";
import { getPublishedPageByKind, getSiteChrome } from "@/modules/website/site.data";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPageByKind("HOME");
  // The home page uses the site's default title (no " · suffix").
  const meta = pageMetadata(page, "/", "Home");
  return { ...meta, title: page?.seoTitle ? { absolute: page.seoTitle } : undefined };
}

/** The showcase: every section comes from the content manager; GSAP adds the motion. */
export default async function HomePage() {
  const [{ page, data }, chrome] = await Promise.all([loadSystemPage("HOME"), getSiteChrome()]);
  return (
    <>
      <HomeMotion>
        <Sections sections={page?.sections ?? []} images={page?.images ?? {}} data={data} />
      </HomeMotion>
      {chrome && <HomePopup banners={chrome.banners} />}
    </>
  );
}
