import { ClockIcon, MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { CourseEnquiryForm } from "@/components/site/public-forms";
import { Container } from "@/components/site/site-ui";
import { getSiteChrome } from "@/modules/website/site.data";

export const generateMetadata = () => systemPageMetadata("CONTACT");

export default async function ContactPage() {
  const [{ page, data }, chrome] = await Promise.all([loadSystemPage("CONTACT"), getSiteChrome()]);
  if (!chrome) return null;
  const rows = [
    chrome.phone && { icon: PhoneIcon, label: chrome.phone, href: `tel:+91${chrome.phone}` },
    chrome.email && { icon: MailIcon, label: chrome.email, href: `mailto:${chrome.email}` },
    chrome.address && { icon: MapPinIcon, label: chrome.address, href: chrome.site.contact.mapUrl || null },
    chrome.site.contact.hours && { icon: ClockIcon, label: chrome.site.contact.hours, href: null },
  ].filter(Boolean) as { icon: typeof PhoneIcon; label: string; href: string | null }[];
  return (
    <PageView page={page} data={data} title="Contact us" subtitle="Call, WhatsApp or send us a message.">
      <section className="py-14 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-reveal className="grid content-start gap-4">
            {rows.map((r) => {
              const body = (
                <>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lavender text-lavender-foreground">
                    <r.icon className="size-5" />
                  </span>
                  <span className="pt-2">{r.label}</span>
                </>
              );
              return r.href ? (
                <a
                  key={r.label}
                  href={r.href}
                  className="flex gap-3 hover:text-primary"
                  {...(r.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {body}
                </a>
              ) : (
                <p key={r.label} className="flex gap-3">
                  {body}
                </p>
              );
            })}
          </div>
          <div data-reveal className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 text-2xl font-bold">Send an enquiry</h2>
            <CourseEnquiryForm
              branches={chrome.branches.filter((b) => b.kind === "INSTITUTE" || b.kind === "BOTH")}
              courses={data.courses.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
        </Container>
      </section>
    </PageView>
  );
}
