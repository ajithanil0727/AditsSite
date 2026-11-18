import {
  AwardIcon,
  BriefcaseIcon,
  ClockIcon,
  CpuIcon,
  GraduationCapIcon,
  LaptopIcon,
  MicroscopeIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Img } from "@/modules/website/site.data";

export const ICONS: Record<string, LucideIcon> = {
  graduation: GraduationCapIcon,
  wrench: WrenchIcon,
  cpu: CpuIcon,
  smartphone: SmartphoneIcon,
  laptop: LaptopIcon,
  briefcase: BriefcaseIcon,
  shield: ShieldCheckIcon,
  clock: ClockIcon,
  award: AwardIcon,
  users: UsersIcon,
  microscope: MicroscopeIcon,
  zap: ZapIcon,
};

export function SiteIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = ICONS[name ?? ""] ?? CpuIcon;
  return <Icon className={className} aria-hidden />;
}

/** Pastel token pairs (background + readable foreground). */
export const TONE_CLASS: Record<string, string> = {
  mint: "bg-mint text-mint-foreground",
  lavender: "bg-lavender text-lavender-foreground",
  peach: "bg-peach text-peach-foreground",
  sky: "bg-sky text-sky-foreground",
};
export const tone = (t: unknown) => TONE_CLASS[String(t)] ?? TONE_CLASS.lavender;

export type LinkValue = { label?: string; href?: string } | null | undefined;
export const hasLink = (l: LinkValue): l is { label: string; href: string } => !!l?.label && !!l?.href;

/** A link that opens external URLs safely in a new tab. */
export function SmartLink({
  href,
  className,
  children,
  ...rest
}: { href: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<"a">, "href">) {
  if (/^(https?:|tel:|mailto:)/i.test(href)) {
    const external = /^https?:/i.test(href);
    return (
      <a
        href={href}
        className={className}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

export function CtaButton({
  link,
  variant = "primary",
  className,
}: {
  link: LinkValue;
  variant?: "primary" | "outline";
  className?: string;
}) {
  if (!hasLink(link)) return null;
  return (
    <SmartLink
      href={link.href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-[transform,background-color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:brightness-110"
          : "border border-foreground/15 bg-background/70 backdrop-blur hover:bg-accent",
        className,
      )}
    >
      {link.label}
    </SmartLink>
  );
}

export function SectionHeading({
  title,
  subtitle,
  align = "center",
  className,
}: {
  title?: unknown;
  subtitle?: unknown;
  align?: "center" | "left";
  className?: string;
}) {
  if (!title && !subtitle) return null;
  return (
    <div data-reveal className={cn("mb-10 max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {title ? <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{String(title)}</h2> : null}
      {subtitle ? <p className="mt-3 text-lg text-pretty text-muted-foreground">{String(subtitle)}</p> : null}
    </div>
  );
}

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function SiteImage({
  image,
  className,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  priority,
  fit = "cover",
}: {
  image: Img | null | undefined;
  className?: string;
  sizes?: string;
  priority?: boolean;
  fit?: "cover" | "contain";
}) {
  if (!image) return null;
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Image
        src={image.url}
        alt={image.alt}
        fill
        sizes={sizes}
        priority={priority}
        className={fit === "cover" ? "object-cover" : "object-contain"}
      />
    </span>
  );
}

export function formatPrice(n: number | null | undefined) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
