import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CertificateResult } from "@/components/site/certificate-result";
import { PageTitle } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { verifyCertificate } from "@/modules/academics/academics.queries";

export const metadata: Metadata = { title: "Certificate verification", robots: { index: false } };

async function Result({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = /^[A-Z0-9]{6,24}$/.test(code) ? await verifyCertificate({ code }) : null;
  if (!c)
    return (
      <p role="alert" className="rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
        We could not find this certificate. Check the link, or{" "}
        <Link href="/verify" className="underline">
          verify it by number
        </Link>
        .
      </p>
    );
  return <CertificateResult c={c} />;
}

/** QR target. The code is long and random, so it can't be guessed. */
export default function VerifyCodePage(props: PageProps<"/verify/[code]">) {
  return (
    <>
      <PageTitle title="Certificate verification" />
      <section className="py-12">
        <Container className="max-w-2xl">
          <Suspense fallback={<p className="text-muted-foreground">Checking…</p>}>
            <Result params={props.params} />
          </Suspense>
        </Container>
      </section>
    </>
  );
}
