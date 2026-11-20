import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { istDateOnly } from "@/lib/fy";
import { certificateCandidates, listCertificates } from "@/modules/academics/academics.queries";
import { getCertificateRules } from "@/modules/academics/academics.service";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { db } from "@/lib/db";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { CandidatesTable, CertificatesTable, RulesDialog } from "./certificates-view";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage(props: PageProps<"/admin/certificates">) {
  const user = await requirePagePermission("certificates.view");
  const sp = await props.searchParams;
  const tab = sp.tab === "issued" ? "issued" : "ready";
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : null;
  const activeBranchId = await getActiveBranchId(user);
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const rules = await getCertificateRules(user.organizationId);
  const branches = await db.branch.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  const revokeBranchIds = branches
    .filter((b) => canAccessBranch(user.access, "certificates.revoke", b.id))
    .map((b) => b.id);

  return (
    <>
      <PageHeader
        title="Certificates"
        description={`Issued when the course is completed, fees are fully paid, overall marks are at least ${rules.passPercent}% and attendance is at least ${rules.minAttendance}%. Each carries a QR code for verification.`}
        actions={can(user.access, "settings.update") && <RulesDialog rules={rules} />}
      />
      <nav className="mb-4 flex gap-1 border-b" aria-label="Certificate lists">
        {[
          ["ready", "Ready to issue"],
          ["issued", "Issued"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/certificates?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "ready" ? (
        <CandidatesTable rows={await certificateCandidates(user, activeBranchId)} today={today} />
      ) : (
        <>
          <form className="mb-3" action="/admin/certificates">
            <input type="hidden" name="tab" value="issued" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search number, student name or ID"
              aria-label="Search certificates"
              className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
            />
          </form>
          <CertificatesTable
            rows={await listCertificates(user, { activeBranchId, q, status: null })}
            revokeBranchIds={revokeBranchIds}
          />
        </>
      )}
    </>
  );
}
