import type { Metadata } from "next";
import { RepairBookingForm } from "@/components/site/public-forms";
import { PageTitle } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { getBookingOptions, getSiteChrome } from "@/modules/website/site.data";

export const metadata: Metadata = {
  title: "Book a repair",
  description: "Book a phone or laptop repair at your nearest service centre.",
  alternates: { canonical: "/book-repair" },
};

export default async function BookRepairPage() {
  const [chrome, options] = await Promise.all([getSiteChrome(), getBookingOptions()]);
  return (
    <>
      <PageTitle
        title="Book a repair"
        subtitle="Tell us about your device. We'll call to confirm a time, and diagnosis starts as soon as you drop it off."
      />
      <section className="py-12 sm:py-16">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <RepairBookingForm
              branches={(chrome?.branches ?? []).filter((b) => b.kind === "SERVICE" || b.kind === "BOTH")}
              deviceTypes={options.deviceTypes}
            />
          </div>
        </Container>
      </section>
    </>
  );
}
