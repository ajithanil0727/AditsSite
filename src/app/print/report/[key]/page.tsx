import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportTable } from "@/components/reports/report-table";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireUser } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { findReport, parseFilters, runReport } from "@/modules/reports/reports";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Report" };

/** Printable report (Print / Save as PDF). Needs the report's permission and reports.export. */
export default async function PrintReportPage(props: PageProps<"/print/report/[key]">) {
  const user = await requireUser();
  const { key } = await props.params;
  const report = findReport(key);
  if (!report || !can(user.access, report.permission) || !can(user.access, "reports.export")) notFound();
  const f = parseFilters(await props.searchParams);
  const result = await runReport(user, report, f);
  if (!result) notFound();
  const [company, branch] = await Promise.all([
    getCompanyProfile(user.organizationId),
    f.branchId ? db.branch.findUnique({ where: { id: f.branchId }, select: { name: true } }) : null,
  ]);
  const landscape = report.columns.length > 6;
  return (
    <>
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }`}</style>
      <article className={`mx-auto bg-card p-8 text-card-foreground shadow-sm print:p-0 print:shadow-none ${landscape ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
        <header className="mb-4 flex items-start justify-between gap-4 border-b pb-3">
          <div>
            <div className="text-lg font-bold">{company.legalName || company.name}</div>
            <div className="text-xl font-semibold">{report.title}</div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {report.usesDates ? `${formatDate(f.from)} to ${formatDate(f.to)}` : `As of ${formatDate(new Date())}`}
            <div>{branch?.name ?? "All branches"}</div>
          </div>
        </header>
        <ReportTable columns={report.columns} rows={result.rows} totals={result.totals} compact />
        <footer className="mt-4 text-xs text-muted-foreground">
          Printed {formatDateTime(new Date())} by {user.name}
        </footer>
      </article>
    </>
  );
}
