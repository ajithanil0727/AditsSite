import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EMPTY, pageMetadata, PageView } from "@/components/site/page-view";
import { Container } from "@/components/site/site-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublishedPage, getSiteCollections } from "@/modules/website/site.data";

/** Custom pages made in the content manager, e.g. /scholarships. Only one path segment. */
async function load(slug: string[]) {
  if (slug.length !== 1) return null;
  const page = await getPublishedPage(slug[0]);
  return page?.kind === "CUSTOM" ? page : null;
}

export async function generateMetadata(props: PageProps<"/[...slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const page = await load(slug);
  return page ? pageMetadata(page, `/${page.slug}`, page.title) : { title: "Page not found" };
}

export default function CustomPage(props: PageProps<"/[...slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-20">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="mt-6 h-48 w-full" />
        </Container>
      }
    >
      <CustomPageBody params={props.params} />
    </Suspense>
  );
}

async function CustomPageBody({ params }: { params: PageProps<"/[...slug]">["params"] }) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  const data = (await getSiteCollections()) ?? EMPTY;
  return <PageView page={page} data={data} title={page.title} />;
}
