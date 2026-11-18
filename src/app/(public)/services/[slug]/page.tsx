import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Markdown } from "@/components/cms/markdown";
import { Reveal } from "@/components/site/reveal";
import { Container, formatPrice, SiteIcon, SiteImage } from "@/components/site/site-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getSiteCollections } from "@/modules/website/site.data";

async function findService(slug: string) {
  const data = await getSiteCollections();
  return data?.services.find((s) => s.slug === slug) ?? null;
}

export async function generateMetadata(props: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await findService(slug);
  if (!s) return { title: "Service not found" };
  return {
    title: s.seoTitle || s.title,
    description: s.seoDescription || s.summary || undefined,
    alternates: { canonical: `/services/${s.slug}` },
  };
}

export default function ServicePage(props: PageProps<"/services/[slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-20">
          <Skeleton className="h-12 w-2/3" />
        </Container>
      }
    >
      <ServiceDetail params={props.params} />
    </Suspense>
  );
}

async function ServiceDetail({ params }: { params: PageProps<"/services/[slug]">["params"] }) {
  const { slug } = await params;
  const s = await findService(slug);
  if (!s) notFound();
  return (
    <Reveal>
      <section className="bg-gradient-to-br from-mint/50 via-background to-sky/40">
        <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <Link href="/services" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              ← All services
            </Link>
            <span className="mt-4 flex size-12 items-center justify-center rounded-2xl bg-mint text-mint-foreground">
              <SiteIcon name={s.icon} className="size-6" />
            </span>
            <h1 data-reveal className="mt-4 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
              {s.title}
            </h1>
            {s.summary && (
              <p data-reveal className="mt-4 text-lg text-muted-foreground">
                {s.summary}
              </p>
            )}
            {s.startingPrice !== null && (
              <p className="mt-4 font-semibold">Starting from {formatPrice(s.startingPrice)}</p>
            )}
            <Link
              href="/book-repair"
              className="mt-8 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-110"
            >
              Book a repair
            </Link>
          </div>
          {s.image && (
            <SiteImage
              image={s.image}
              className="aspect-[4/3] rounded-3xl shadow-lg"
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          )}
        </Container>
      </section>
      {s.description && (
        <Container className="max-w-3xl py-14">
          <div data-reveal>
            <Markdown>{s.description}</Markdown>
          </div>
        </Container>
      )}
    </Reveal>
  );
}
