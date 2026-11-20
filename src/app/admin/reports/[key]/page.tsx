import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReportTable } from "@/components/reports/report-table";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/modules/auth/current";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { findReport, parseFilters, runReport } from "@/modules/reports/reports";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage(props: PageProps<"/admin/reports/[key]">) {
  const user = await requirePagePermission("reports.view");
  const { key } = await props.params;
  const report = findReport(key);
  if (!report) notFound();
  if (!can(user.access, report.permission)) redirect("/admin/no-access");
  const f = parseFilters(await props.searchParams);
  const result = await runReport(user, report, f);
  const branches = (
    await db.branch.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
  ).filter((b) => canAccessBranch(user.access, report.permission, b.id));
  const qs = new URLSearchParams({ from: f.from, to: f.to, ...(f.branchId ? { branch: f.branchId } : {}) }).toString();
  const canExport = can(user.access, "reports.export");

  return (
    <>
      <PageHeader
        title={report.title}
        description={report.description}
        actions={
          canExport &&
          result && (
            <>
              <Button variant="outline" asChild>
                <a href={`/print/report/${report.key}?${qs}`} target="_blank" rel="noreferrer">
                  <PrinterIcon /> Print / PDF
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/reports/${report.key}?${qs}`}>
                  <DownloadIcon /> Excel
                </a>
              </Button>
            </>
          )
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" action={`/admin/reports/${report.key}`}>
        {report.usesDates && (
          <>
            <label className="grid gap-1 text-sm">
              From
              <input type="date" name="from" defaultValue={f.from} className="h-9 rounded-md border bg-background px-2" />
            </label>
            <label className="grid gap-1 text-sm">
              To
              <input type="date" name="to" defaultValue={f.to} className="h-9 rounded-md border bg-background px-2" />
            </label>
          </>
        )}
        {branches.length > 1 && (
          <label className="grid gap-1 text-sm">
            Branch
            <select name="branch" defaultValue={f.branchId ?? ""} className="h-9 rounded-md border bg-background px-2">
              <option value="">All my branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button type="submit">Show</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border p-2">
        {result ? (
          <ReportTable columns={report.columns} rows={result.rows} totals={result.totals} />
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">You can&apos;t see this branch.</p>
        )}
      </div>
    </>
  );
}
