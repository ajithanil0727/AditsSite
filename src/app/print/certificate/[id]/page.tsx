import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getCertificateForPrint } from "@/modules/academics/academics.queries";
import { requireUser } from "@/modules/auth/current";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Certificate" };

/** Course certificate (A4 landscape). The QR code opens the public verification page. */
export default async function PrintCertificatePage(props: PageProps<"/print/certificate/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const c = await getCertificateForPrint(user, id);
  if (!c) notFound();
  const company = await getCompanyProfile(user.organizationId);
  const verifyUrl = new URL(`/verify/${c.verifyCode}`, env.APP_URL).toString();
  const qr = await QRCode.toString(verifyUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const e = c.enrollment;
  const from = e.batch?.startDate ?? e.enrolledAt;
  const to = e.completedAt ?? e.batch?.endDate ?? null;

  return (
    <>
      <style>{"@page { size: A4 landscape; margin: 0; }"}</style>
      <article className="relative mx-auto aspect-[297/210] w-full max-w-[297mm] bg-card p-[10mm] text-card-foreground shadow-sm print:shadow-none">
        {c.status === "REVOKED" && (
          <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 -rotate-12 text-center text-6xl font-bold tracking-widest text-destructive/40">
            CANCELLED
          </div>
        )}
        <div className="flex h-full flex-col border-4 border-double border-primary p-[10mm]">
          <header className="flex flex-col items-center gap-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {company.logoUrl && <img src={company.logoUrl} alt="" className="size-16 object-contain" />}
            <div className="text-2xl font-bold tracking-wide">{company.legalName || company.name}</div>
            <div className="text-sm text-muted-foreground">
              {[c.branch.name, c.branch.city].filter(Boolean).join(", ")}
            </div>
          </header>

          <div className="mt-6 text-center">
            <div className="text-4xl font-bold tracking-[0.2em] text-primary uppercase">Certificate</div>
            <div className="mt-1 text-sm tracking-widest text-muted-foreground uppercase">of course completion</div>
          </div>

          <div className="mt-8 flex-1 text-center text-lg leading-relaxed">
            <p>This is to certify that</p>
            <p className="my-2 text-3xl font-semibold">{e.student.name}</p>
            {e.student.guardianName && (
              <p className="text-base text-muted-foreground">son / daughter of {e.student.guardianName}</p>
            )}
            <p className="mt-3">
              has successfully completed the course <span className="font-semibold">{e.course.name}</span>
            </p>
            <p>
              from {formatDate(from)}
              {to ? ` to ${formatDate(to)}` : ""}
              {c.grade ? (
                <>
                  {" "}
                  with grade <span className="font-semibold">{c.grade}</span>
                </>
              ) : null}
              .
            </p>
          </div>

          <footer className="mt-6 grid grid-cols-3 items-end gap-6 text-sm">
            <div className="space-y-0.5">
              <div>
                <span className="text-muted-foreground">Certificate no. </span>
                <span className="font-mono font-medium">{c.certificateNo}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Student ID </span>
                {e.student.studentCode}
              </div>
              <div>
                <span className="text-muted-foreground">Issued on </span>
                {formatDate(c.issuedAt)}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="size-24 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
              <div className="text-center text-[10px] text-muted-foreground">
                Scan to verify, or visit {new URL("/verify", env.APP_URL).host}/verify
              </div>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-1 h-10 w-48 border-b border-foreground/60" />
              Authorised signatory
            </div>
          </footer>
        </div>
      </article>
    </>
  );
}
