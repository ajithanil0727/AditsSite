import type { Metadata } from "next";
import { PageTitle } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { TrackForm } from "./track-form";

export const metadata: Metadata = {
  title: "Track your repair",
  description: "Check the status of your device repair with your job card number and phone number.",
  alternates: { canonical: "/track" },
};

export default function TrackPage() {
  return (
    <>
      <PageTitle
        title="Track your repair"
        subtitle="Enter the job number from your job card and the phone number you gave us."
      />
      <section className="py-12">
        <Container className="max-w-xl">
          <TrackForm />
        </Container>
      </section>
    </>
  );
}
