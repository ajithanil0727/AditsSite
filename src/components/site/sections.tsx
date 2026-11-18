import { ArrowRightIcon, MapPinIcon, PhoneIcon, QuoteIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { Markdown } from "@/components/cms/markdown";
import { cn } from "@/lib/utils";
import type { Img, RenderSection, SiteCollections } from "@/modules/website/site.data";
import { CircuitIllustration } from "./circuit";
import { TestimonialCarousel } from "./testimonial-carousel";
import {
  Container,
  CtaButton,
  formatPrice,
  SectionHeading,
  SiteIcon,
  SiteImage,
  SmartLink,
  tone,
  type LinkValue,
} from "./site-ui";

type C = Record<string, unknown>;
type Ctx = { images: Record<string, Img>; data: SiteCollections; first: boolean };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const img = (ctx: Ctx, id: unknown) => (typeof id === "string" ? (ctx.images[id] ?? null) : null);

/** Render CMS sections in order. Used by the home page (with GSAP) and every other page (light motion). */
export function Sections({
  sections,
  images,
  data,
}: {
  sections: RenderSection[];
  images: Record<string, Img>;
  data: SiteCollections;
}) {
  return (
    <>
      {sections.map((s, i) => {
        const ctx: Ctx = { images, data, first: i === 0 };
        const Comp = REGISTRY[s.type];
        return Comp ? <Comp key={s.id} c={s.content} ctx={ctx} /> : null;
      })}
    </>
  );
}

const REGISTRY: Record<string, (p: { c: C; ctx: Ctx }) => React.ReactNode> = {
  hero: Hero,
  stats: Stats,
  features: Features,
  steps: Steps,
  courses: (p) => <CourseGrid title={p.c.title} subtitle={p.c.subtitle} courses={pickCourses(p.c, p.ctx.data)} />,
  services: (p) => <ServiceGrid title={p.c.title} subtitle={p.c.subtitle} services={pickServices(p.c, p.ctx.data)} />,
  placements: (p) => (
    <Placements
      title={p.c.title}
      subtitle={p.c.subtitle}
      data={p.ctx.data}
      showLogos={p.c.showLogos !== false}
      showStories={p.c.showStories !== false}
    />
  ),
  testimonials: (p) => <Testimonials title={p.c.title} subtitle={p.c.subtitle} data={p.ctx.data} />,
  branches: (p) => <Branches title={p.c.title} subtitle={p.c.subtitle} data={p.ctx.data} />,
  cta: Cta,
  richText: RichText,
  imageText: ImageText,
  faq: (p) => (
    <FaqList
      title={p.c.title}
      faqs={p.ctx.data.faqs.filter((f) => !str(p.c.category) || f.category === str(p.c.category))}
    />
  ),
  gallery: (p) => (
    <Gallery
      title={p.c.title}
      items={p.ctx.data.gallery
        .filter((g) => !str(p.c.album) || g.album === str(p.c.album))
        .slice(0, num(p.c.limit, 8))}
    />
  ),
};

// ------------------------------------------------------------------ hero

function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const i = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="bg-gradient-to-r from-primary to-lavender-foreground bg-clip-text text-transparent">
        {text.slice(i, i + highlight.length)}
      </span>
      {text.slice(i + highlight.length)}
    </>
  );
}

function Hero({ c, ctx }: { c: C; ctx: Ctx }) {
  const image = img(ctx, c.image);
  const Heading = ctx.first ? "h1" : "h2";
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-lavender/60 via-background to-mint/50">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-sky/60 blur-3xl"
        data-parallax="0.15"
      />
      <Container className="relative grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <div>
          {str(c.eyebrow) && (
            <p
              data-hero-line
              className="mb-4 inline-flex rounded-full bg-background/70 px-3 py-1 text-sm font-medium text-lavender-foreground shadow-sm ring-1 ring-foreground/5"
            >
              {str(c.eyebrow)}
            </p>
          )}
          <Heading
            data-hero-line
            className="text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            <Highlighted text={str(c.headline)} highlight={str(c.highlight)} />
          </Heading>
          {str(c.subtext) && (
            <p data-hero-line className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
              {str(c.subtext)}
            </p>
          )}
          <div data-hero-line className="mt-8 flex flex-wrap gap-3">
            <CtaButton link={c.primary as LinkValue} />
            <CtaButton link={c.secondary as LinkValue} variant="outline" />
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          {image ? (
            <SiteImage
              image={image}
              className="aspect-[4/3] rounded-3xl shadow-xl"
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
            />
          ) : (
            <CircuitIllustration />
          )}
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ numbers, features, steps

function Stats({ c }: { c: C }) {
  const items = list<{ value: number; suffix?: string; label: string }>(c.items);
  if (items.length === 0) return null;
  return (
    <section className="py-14 sm:py-16">
      <Container>
        <SectionHeading title={c.title} />
        <dl data-stagger className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {items.map((s, i) => (
            <div key={i} className="rounded-2xl border bg-card p-6 text-center shadow-sm">
              <dt className="order-2 mt-1 text-sm text-muted-foreground">{s.label}</dt>
              <dd className="text-3xl font-extrabold tracking-tight text-primary tabular-nums sm:text-4xl">
                <span data-counter={s.value}>{new Intl.NumberFormat("en-IN").format(s.value)}</span>
                {s.suffix}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Features({ c }: { c: C }) {
  const items = list<{ icon: string; tone: string; title: string; text?: string; link?: LinkValue }>(c.items);
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={c.title} subtitle={c.subtitle} />
        <div
          data-stagger
          className={cn(
            "grid gap-5",
            items.length === 4
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : items.length >= 3
                ? "md:grid-cols-3"
                : "md:grid-cols-2",
          )}
        >
          {items.map((f, i) => (
            <div
              key={i}
              data-tilt
              className="group relative flex flex-col rounded-3xl border bg-card p-7 shadow-sm transition-shadow [transform-style:preserve-3d] hover:shadow-lg"
            >
              <span className={cn("mb-5 inline-flex size-12 items-center justify-center rounded-2xl", tone(f.tone))}>
                <SiteIcon name={f.icon} className="size-6" />
              </span>
              <h3 className="text-xl font-bold">{f.title}</h3>
              {f.text && <p className="mt-2 flex-1 text-muted-foreground">{f.text}</p>}
              {f.link?.label && f.link.href && (
                <SmartLink
                  href={f.link.href}
                  className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                >
                  {f.link.label}
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                </SmartLink>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

const STEP_TONES = [
  "bg-lavender text-lavender-foreground",
  "bg-mint text-mint-foreground",
  "bg-peach text-peach-foreground",
  "bg-sky text-sky-foreground",
];

function Steps({ c }: { c: C }) {
  const items = list<{ title: string; text?: string }>(c.items);
  if (items.length === 0) return null;
  return (
    <section data-hscroll className="overflow-hidden bg-muted/40 py-16 sm:py-20">
      <Container>
        <SectionHeading title={c.title} subtitle={c.subtitle} />
      </Container>
      {/* Vertical list on phones; on desktop the home page pins this row and scrolls it sideways. */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ol data-hscroll-track className="grid gap-4 lg:flex lg:w-max lg:gap-6">
          {items.map((s, i) => (
            <li
              key={i}
              data-reveal
              className="relative flex gap-4 rounded-3xl border bg-card p-6 shadow-sm lg:w-80 lg:flex-col"
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold",
                  STEP_TONES[i % 4],
                )}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-bold">{s.title}</h3>
                {s.text && <p className="mt-1 text-muted-foreground">{s.text}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ courses & services

function pickCourses(c: C, data: SiteCollections) {
  const all = c.mode === "all" ? data.courses : data.courses.filter((x) => x.featured);
  return (all.length ? all : data.courses).slice(0, num(c.limit, 6));
}
function pickServices(c: C, data: SiteCollections) {
  const all = c.mode === "all" ? data.services : data.services.filter((x) => x.featured);
  return (all.length ? all : data.services).slice(0, num(c.limit, 6));
}

export function CourseGrid({
  title,
  subtitle,
  courses,
}: {
  title?: unknown;
  subtitle?: unknown;
  courses: SiteCollections["courses"];
}) {
  if (courses.length === 0) return null;
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} subtitle={subtitle} />
        <div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, i) => (
            <Link
              key={course.id}
              href={`/courses/${course.slug}`}
              data-tilt
              className="group flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-shadow hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {course.image ? (
                <SiteImage image={course.image} className="aspect-[16/9]" />
              ) : (
                <div className={cn("flex aspect-[16/9] items-center justify-center", STEP_TONES[i % 4])}>
                  <SiteIcon name={i % 2 ? "laptop" : "smartphone"} className="size-12 opacity-70" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{course.duration}</p>
                <h3 className="mt-1 text-lg font-bold">{course.name}</h3>
                {course.shortDescription && (
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{course.shortDescription}</p>
                )}
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-semibold">
                    {course.fee !== null ? formatPrice(course.fee) : "Contact us for fees"}
                  </span>
                  <ArrowRightIcon className="size-4 text-primary transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function ServiceGrid({
  title,
  subtitle,
  services,
}: {
  title?: unknown;
  subtitle?: unknown;
  services: SiteCollections["services"];
}) {
  if (services.length === 0) return null;
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} subtitle={subtitle} />
        <div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <Link
              key={s.id}
              href={`/services/${s.slug}`}
              data-tilt
              className="group flex flex-col rounded-3xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                className={cn("mb-4 inline-flex size-12 items-center justify-center rounded-2xl", STEP_TONES[i % 4])}
              >
                <SiteIcon name={s.icon} className="size-6" />
              </span>
              <h3 className="text-lg font-bold">{s.title}</h3>
              {s.summary && <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.summary}</p>}
              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="font-semibold">
                  {s.startingPrice !== null ? `From ${formatPrice(s.startingPrice)}` : "Free diagnosis"}
                </span>
                <ArrowRightIcon className="size-4 text-primary transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ placements, testimonials, branches

export function Placements({
  title,
  subtitle,
  data,
  showLogos = true,
  showStories = true,
}: {
  title?: unknown;
  subtitle?: unknown;
  data: SiteCollections;
  showLogos?: boolean;
  showStories?: boolean;
}) {
  const logos = showLogos ? data.companies : [];
  const stories = showStories ? data.stories : [];
  if (logos.length === 0 && stories.length === 0) return null;
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} subtitle={subtitle} />
      </Container>
      {logos.length > 0 && (
        <div className="marquee relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)] py-2">
          <ul className="marquee-track flex w-max gap-12 motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center">
            {[...logos, ...logos].map((co, i) => (
              <li
                key={`${co.id}-${i}`}
                aria-hidden={i >= logos.length}
                className="flex h-14 w-36 items-center justify-center"
              >
                <SiteImage
                  image={co.logo}
                  fit="contain"
                  className="h-12 w-32 opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0"
                  sizes="128px"
                />
                <span className="sr-only">{co.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {stories.length > 0 && (
        <Container className="mt-10">
          <div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((s) => (
              <figure key={s.id} className="flex flex-col rounded-3xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  {s.photo ? (
                    <SiteImage image={s.photo} className="size-14 shrink-0 rounded-full" sizes="56px" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-mint text-lg font-bold text-mint-foreground">
                      {s.studentName.charAt(0)}
                    </span>
                  )}
                  <div>
                    <figcaption className="font-bold">{s.studentName}</figcaption>
                    <p className="text-sm text-muted-foreground">
                      {[s.designation, s.companyName].filter(Boolean).join(" at ")}
                    </p>
                  </div>
                </div>
                {s.quote && <blockquote className="mt-4 flex-1 text-sm text-muted-foreground">“{s.quote}”</blockquote>}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {s.courseName && (
                    <span className="rounded-full bg-lavender px-2.5 py-1 text-lavender-foreground">
                      {s.courseName}
                    </span>
                  )}
                  {s.packageText && (
                    <span className="rounded-full bg-mint px-2.5 py-1 text-mint-foreground">{s.packageText}</span>
                  )}
                </div>
              </figure>
            ))}
          </div>
        </Container>
      )}
    </section>
  );
}

export function Testimonials({
  title,
  subtitle,
  data,
}: {
  title?: unknown;
  subtitle?: unknown;
  data: SiteCollections;
}) {
  if (data.testimonials.length === 0) return null;
  return (
    <section className="bg-gradient-to-b from-background via-lavender/30 to-background py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} subtitle={subtitle} />
        <TestimonialCarousel
          items={data.testimonials.map((t) => ({
            id: t.id,
            card: (
              <figure className="flex h-full flex-col rounded-3xl border bg-card p-7 shadow-sm">
                <QuoteIcon className="size-7 text-lavender-foreground/60" aria-hidden />
                <blockquote className="mt-3 flex-1 text-pretty">{t.quote}</blockquote>
                {t.rating ? (
                  <div className="mt-4 flex gap-0.5" aria-label={`${t.rating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <StarIcon
                        key={i}
                        className={cn(
                          "size-4",
                          i < t.rating! ? "fill-warning text-warning" : "text-muted-foreground/30",
                        )}
                        aria-hidden
                      />
                    ))}
                  </div>
                ) : null}
                <figcaption className="mt-5 flex items-center gap-3">
                  {t.photo ? (
                    <SiteImage image={t.photo} className="size-11 rounded-full" sizes="44px" />
                  ) : (
                    <span className="flex size-11 items-center justify-center rounded-full bg-peach font-bold text-peach-foreground">
                      {t.name.charAt(0)}
                    </span>
                  )}
                  <span>
                    <span className="block font-semibold">{t.name}</span>
                    {t.role && <span className="block text-sm text-muted-foreground">{t.role}</span>}
                  </span>
                </figcaption>
              </figure>
            ),
          }))}
        />
      </Container>
    </section>
  );
}

export function Branches({ title, subtitle, data }: { title?: unknown; subtitle?: unknown; data: SiteCollections }) {
  if (data.branches.length === 0) return null;
  const kindLabel: Record<string, string> = {
    HEAD_OFFICE: "Head office",
    INSTITUTE: "Training institute",
    SERVICE: "Service centre",
    BOTH: "Institute & service centre",
  };
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} subtitle={subtitle} />
        <div data-stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.branches.map((b) => (
            <div key={b.id} className="flex flex-col rounded-3xl border bg-card p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="relative mt-1 flex size-3 shrink-0">
                  <span className="pin-pulse absolute inset-0 rounded-full bg-primary/50" />
                  <span className="relative size-3 rounded-full bg-primary" />
                </span>
                <div>
                  <h3 className="text-lg font-bold">{b.name}</h3>
                  <p className="text-xs font-medium text-lavender-foreground">{kindLabel[b.kind] ?? ""}</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{b.address}</p>
              {b.hours && <p className="mt-2 text-sm text-muted-foreground">{b.hours}</p>}
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                <a
                  href={`tel:+91${b.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 font-medium text-mint-foreground"
                >
                  <PhoneIcon className="size-3.5" /> {b.phone}
                </a>
                <a
                  href={b.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky px-3 py-1.5 font-medium text-sky-foreground"
                >
                  <MapPinIcon className="size-3.5" /> Directions
                </a>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ CTA, text

function Cta({ c }: { c: C }) {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <div
          data-reveal
          className={cn(
            "relative overflow-hidden rounded-[2rem] px-6 py-12 text-center sm:px-12 sm:py-16",
            tone(c.tone),
          )}
        >
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{str(c.headline)}</h2>
          {str(c.text) && <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">{str(c.text)}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaButton link={c.primary as LinkValue} />
            <CtaButton link={c.secondary as LinkValue} variant="outline" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function RichText({ c, ctx }: { c: C; ctx: Ctx }) {
  const Heading = ctx.first ? "h1" : "h2";
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        {str(c.title) && (
          <Heading data-reveal className="mb-6 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {str(c.title)}
          </Heading>
        )}
        <div data-reveal>
          <Markdown>{str(c.body)}</Markdown>
        </div>
      </Container>
    </section>
  );
}

function ImageText({ c, ctx }: { c: C; ctx: Ctx }) {
  const image = img(ctx, c.image);
  return (
    <section className="py-12 sm:py-16">
      <Container className="grid items-center gap-10 md:grid-cols-2">
        <div data-reveal className={cn(c.imageSide === "left" && "md:order-2")}>
          {str(c.title) && <h2 className="mb-4 text-3xl font-bold tracking-tight text-balance">{str(c.title)}</h2>}
          <Markdown>{str(c.body)}</Markdown>
          <CtaButton link={c.link as LinkValue} className="mt-6" />
        </div>
        {image && (
          <div data-reveal>
            <SiteImage
              image={image}
              className="aspect-[4/3] rounded-3xl shadow-md"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
        )}
      </Container>
    </section>
  );
}

export function FaqList({ title, faqs }: { title?: unknown; faqs: SiteCollections["faqs"] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="py-16 sm:py-20">
      <Container className="max-w-3xl">
        <SectionHeading title={title} />
        <div className="divide-y rounded-3xl border bg-card">
          {faqs.map((f) => (
            <details key={f.id} data-reveal className="group px-6 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.question}
                <span className="text-xl text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <Markdown className="mt-3 text-muted-foreground">{f.answer}</Markdown>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function Gallery({ title, items }: { title?: unknown; items: SiteCollections["gallery"] }) {
  if (items.length === 0) return null;
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <SectionHeading title={title} />
        <div data-stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((g) => (
            <figure key={g.id} className="group overflow-hidden rounded-2xl border bg-muted">
              <SiteImage
                image={g.image}
                className="aspect-square transition-transform duration-500 group-hover:scale-105"
                sizes="(min-width: 1024px) 25vw, 50vw"
              />
              {g.caption && <figcaption className="px-3 py-2 text-xs text-muted-foreground">{g.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Title band for pages whose first section isn't a hero. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <section className="bg-gradient-to-br from-lavender/50 via-background to-sky/40">
      <Container className="py-14 sm:py-20">
        <h1 data-reveal className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p data-reveal className="mt-3 max-w-2xl text-lg text-muted-foreground">
            {subtitle}
          </p>
        )}
      </Container>
    </section>
  );
}
