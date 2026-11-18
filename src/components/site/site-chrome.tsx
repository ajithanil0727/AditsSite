import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { whatsappLink } from "@/modules/leads/lead-logic";
import type { SiteChrome } from "@/modules/website/site.data";
import { MobileNav } from "./mobile-nav";
import { FacebookIcon, InstagramIcon, LinkedinIcon, XIcon, YoutubeIcon } from "./social-icons";
import { Container, SmartLink } from "./site-ui";

export function SiteHeader({ chrome }: { chrome: SiteChrome }) {
  const { company, site, header } = chrome;
  return (
    <header className="sticky top-0 z-40 border-b border-foreground/5 bg-background/80 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 font-bold">
          {company.logoUrl ? (
            <Image
              src={company.logoUrl}
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-lg object-contain"
              unoptimized
            />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              {company.name.charAt(0)}
            </span>
          )}
          <span className="truncate">{company.name}</span>
        </Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {header.map((item) =>
            item.children.length ? (
              <div key={item.id} className="group relative">
                <SmartLink
                  href={item.href}
                  className="rounded-full px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </SmartLink>
                <div className="invisible absolute top-full left-0 z-50 min-w-48 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="rounded-xl border bg-popover p-1.5 shadow-lg">
                    {item.children.map((c) => (
                      <SmartLink
                        key={c.id}
                        href={c.href}
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-accent"
                      >
                        {c.label}
                      </SmartLink>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <SmartLink
                key={item.id}
                href={item.href}
                target={item.newTab ? "_blank" : undefined}
                className="rounded-full px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </SmartLink>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          <ThemeToggle />
          {site.header.ctaLabel && site.header.ctaHref && (
            <SmartLink
              href={site.header.ctaHref}
              className="hidden h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-sm hover:brightness-110 sm:inline-flex"
            >
              {site.header.ctaLabel}
            </SmartLink>
          )}
          <MobileNav
            items={header}
            cta={
              site.header.ctaLabel && site.header.ctaHref
                ? { label: site.header.ctaLabel, href: site.header.ctaHref }
                : null
            }
          />
        </div>
      </Container>
    </header>
  );
}

const SOCIAL = [
  { key: "facebook", icon: FacebookIcon, label: "Facebook" },
  { key: "instagram", icon: InstagramIcon, label: "Instagram" },
  { key: "youtube", icon: YoutubeIcon, label: "YouTube" },
  { key: "linkedin", icon: LinkedinIcon, label: "LinkedIn" },
  { key: "x", icon: XIcon, label: "X" },
] as const;

export function SiteFooter({ chrome }: { chrome: SiteChrome }) {
  const { company, site, footer } = chrome;
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="text-lg font-bold">{company.name}</p>
          {(site.footer.about || company.tagline) && (
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{site.footer.about || company.tagline}</p>
          )}
          <div className="mt-4 flex gap-2">
            {SOCIAL.filter((s) => site.social[s.key]).map((s) => (
              <a
                key={s.key}
                href={site.social[s.key]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex size-9 items-center justify-center rounded-full border bg-background hover:bg-accent"
              >
                <s.icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
        {footer.length > 0 && (
          <nav aria-label="Footer" className="grid content-start gap-2 text-sm">
            <p className="font-semibold">Explore</p>
            {footer
              .flatMap((f) => [f, ...f.children])
              .map((f) => (
                <SmartLink key={f.id} href={f.href} className="text-muted-foreground hover:text-foreground">
                  {f.label}
                </SmartLink>
              ))}
          </nav>
        )}
        <div className="grid content-start gap-2.5 text-sm">
          <p className="font-semibold">Contact</p>
          {chrome.phone && (
            <a
              href={`tel:+91${chrome.phone}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <PhoneIcon className="size-4" /> {chrome.phone}
            </a>
          )}
          {chrome.email && (
            <a
              href={`mailto:${chrome.email}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <MailIcon className="size-4" /> {chrome.email}
            </a>
          )}
          {chrome.address && (
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" /> {chrome.address}
            </p>
          )}
          {site.contact.hours && <p className="text-muted-foreground">{site.contact.hours}</p>}
        </div>
      </Container>
      <div className="border-t">
        <Container className="flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-muted-foreground">
          <span>{site.footer.copyright || `© ${chrome.year} ${company.legalName || company.name}`}</span>
          <span className="flex gap-4">
            <Link href="/track" className="hover:text-foreground">
              Track your repair
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Staff sign in
            </Link>
          </span>
        </Container>
      </div>
    </footer>
  );
}

export function WhatsAppButton({ number, message }: { number: string; message: string }) {
  if (!number) return null;
  return (
    <a
      href={whatsappLink(number, message || undefined)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-success text-background shadow-lg transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:right-6 sm:bottom-6"
    >
      <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden>
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.03c-.25.69-1.44 1.32-2 1.38-.51.07-1.16.1-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.91-4.27-5.06-4.47-.15-.2-1.21-1.6-1.21-3.06 0-1.45.76-2.17 1.03-2.46.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.25.59.84 2.05.91 2.2.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.01 2.09 1.33 2.39 1.48.3.15.47.12.64-.07.17-.2.74-.86.94-1.16.2-.3.39-.25.66-.15.27.1 1.73.82 2.03.97.3.15.49.22.57.35.07.12.07.71-.18 1.4Z" />
      </svg>
    </a>
  );
}
