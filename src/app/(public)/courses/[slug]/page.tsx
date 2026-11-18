import { CheckIcon, ClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Markdown } from "@/components/cms/markdown";
import { Reveal } from "@/components/site/reveal";
import { Container, formatPrice, SiteImage } from "@/components/site/site-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getSiteCollections } from "@/modules/website/site.data";

async function findCourse(slug: string) {
  const data = await getSiteCollections();
  return data?.courses.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata(props: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const c = await findCourse(slug);
  if (!c) return { title: "Course not found" };
  return {
    title: c.seoTitle || c.name,
    description: c.seoDescription || c.shortDescription || undefined,
    alternates: { canonical: `/courses/${c.slug}` },
    openGraph: c.image ? { images: [{ url: c.image.url, alt: c.image.alt }] } : undefined,
  };
}

export default function CoursePage(props: PageProps<"/courses/[slug]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-20">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="mt-6 h-40 w-full" />
        </Container>
      }
    >
      <CourseDetail params={props.params} />
    </Suspense>
  );
}

async function CourseDetail({ params }: { params: PageProps<"/courses/[slug]">["params"] }) {
  const { slug } = await params;
  const c = await findCourse(slug);
  if (!c) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: c.name,
    description: c.shortDescription ?? c.name,
    ...(c.fee !== null ? { offers: { "@type": "Offer", price: c.fee, priceCurrency: "INR", category: "Paid" } } : {}),
  };
  return (
    <Reveal>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <section className="bg-gradient-to-br from-lavender/50 via-background to-mint/40">
        <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <Link href="/courses" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              ← All courses
            </Link>
            <h1 data-reveal className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
              {c.name}
            </h1>
            {c.shortDescription && (
              <p data-reveal className="mt-4 text-lg text-muted-foreground">
                {c.shortDescription}
              </p>
            )}
            <div data-reveal className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 font-medium shadow-sm">
                <ClockIcon className="size-4" /> {c.duration}
              </span>
              <span className="rounded-full bg-background/80 px-3 py-1.5 font-semibold shadow-sm">
                {c.fee !== null
                  ? `${formatPrice(c.fee)}${c.gstMode === "EXCLUSIVE" ? " + GST" : ""}`
                  : "Contact us for fees"}
              </span>
            </div>
            <Link
              href={`/enquire?course=${c.slug}`}
              className="mt-8 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-110"
            >
              Enquire about this course
            </Link>
          </div>
          {c.image && (
            <SiteImage
              image={c.image}
              className="aspect-[4/3] rounded-3xl shadow-lg"
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          )}
        </Container>
      </section>
      <Container className="grid gap-12 py-14 lg:grid-cols-[1.4fr_1fr]">
        <div data-reveal>
          {c.description ? (
            <Markdown>{c.description}</Markdown>
          ) : (
            <p className="text-muted-foreground">Ask us for the full course details.</p>
          )}
          {c.eligibility && (
            <div className="mt-8 rounded-2xl bg-sky/60 p-5 text-sky-foreground">
              <p className="font-semibold">Who can join</p>
              <p className="mt-1 text-sm">{c.eligibility}</p>
            </div>
          )}
        </div>
        {c.modules.length > 0 && (
          <aside data-reveal className="h-fit rounded-3xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold">What you will learn</h2>
            <ol className="mt-4 grid gap-3">
              {c.modules.map((m, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-mint-foreground" />
                  <span className="flex-1">{m.title}</span>
                  {m.hours ? <span className="text-muted-foreground">{m.hours} h</span> : null}
                </li>
              ))}
            </ol>
          </aside>
        )}
      </Container>
    </Reveal>
  );
}
