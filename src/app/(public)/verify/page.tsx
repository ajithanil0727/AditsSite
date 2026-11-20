import type { Metadata } from "next";
import { PageTitle } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description:
    "Check that a course certificate is genuine with its certificate number and issue date, or scan its QR code.",
  alternates: { canonical: "/verify" },
};

export default function VerifyPage() {
  return (
    <>
      <PageTitle
        title="Verify a certificate"
        subtitle="Scan the QR code on the certificate, or enter its number and issue date."
      />
      <section className="py-12">
        <Container className="max-w-2xl">
          <VerifyForm />
        </Container>
      </section>
    </>
  );
}
