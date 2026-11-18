import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HomeMotion } from "@/components/site/home-motion";
import { EMPTY, PageView } from "@/components/site/page-view";
import { Sections } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePagePermission } from "@/modules/auth/current";
import { getSiteCollections, previewSections } from "@/modules/website/site.data";
import { getDraftPage } from "@/modules/website/website.queries";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/** Draft preview for editors (signed in with website.view). Shows unpublished section changes. */
export default function PreviewPage(props: PageProps<"/preview/[pageId]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-20">
          <Skeleton className="h-12 w-1/2" />
        </Container>
      }
    >
      <Preview params={props.params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: PageProps<"/preview/[pageId]">["params"] }) {
  const user = await requirePagePermission("website.view");
  const { pageId } = await params;
  const page = await getDraftPage(user.organizationId, pageId);
  if (!page) notFound();
  const [{ sections, images }, data] = await Promise.all([previewSections(page.sections), getSiteCollections()]);
  const view = {
    id: page.id,
    kind: page.kind,
    slug: page.slug,
    title: page.title,
    seoTitle: null,
    seoDescription: null,
    ogImage: null,
    sections,
    images,
  };
  return (
    <>
      <div className="sticky top-16 z-30 border-b bg-peach text-peach-foreground">
        <Container className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span>
            <strong>Preview</strong> of the draft. Visitors don&apos;t see these changes until you publish.
          </span>
          <Link href={`/admin/website/pages/${page.id}`} className="font-semibold underline underline-offset-2">
            Back to the editor
          </Link>
        </Container>
      </div>
      {page.kind === "HOME" ? (
        <HomeMotion>
          <Sections sections={sections} images={images} data={data ?? EMPTY} />
        </HomeMotion>
      ) : (
        <PageView page={view} data={data ?? EMPTY} title={page.title} />
      )}
    </>
  );
}
