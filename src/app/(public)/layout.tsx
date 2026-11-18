import type { Metadata } from "next";
import { TopBanner } from "@/components/site/banners";
import { SiteFooter, SiteHeader, WhatsAppButton } from "@/components/site/site-chrome";
import { env } from "@/lib/env";
import { getSiteChrome } from "@/modules/website/site.data";

export async function generateMetadata(): Promise<Metadata> {
  const chrome = await getSiteChrome();
  const name = chrome?.company.name ?? "Our Institute";
  const seo = chrome?.site.seo;
  return {
    metadataBase: new URL(env.APP_URL),
    title: { default: seo?.defaultTitle || name, template: `%s · ${seo?.titleSuffix || name}` },
    description: seo?.description || chrome?.company.tagline || undefined,
    keywords: seo?.keywords || undefined,
    openGraph: {
      type: "website",
      siteName: name,
      locale: "en_IN",
      ...(seo?.ogImageId ? { images: [{ url: `/api/files/${seo.ogImageId}` }] } : {}),
    },
  };
}

/** Public website shell: cached header/footer from the content manager. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const chrome = await getSiteChrome();
  if (!chrome) return <main className="p-8">The website isn&apos;t set up yet.</main>;
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <TopBanner banners={chrome.banners} />
      <SiteHeader chrome={chrome} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter chrome={chrome} />
      <WhatsAppButton number={chrome.whatsapp} message={chrome.site.whatsapp.message} />
    </div>
  );
}
