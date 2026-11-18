import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { istDateOnly } from "@/lib/fy";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import type { ReportRow } from "@/modules/leads/lead-logic";
import { leadReport } from "@/modules/leads/leads.queries";
import { ReportFilters } from "./report-filters";

export const metadata: Metadata = { title: "Enquiry conversion" };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);

function RowsTable({ title, rows, first }: { title: string; rows: ReportRow[]; first: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{first}</TableHead>
              <TableHead className="text-right">Enquiries</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">Lost</TableHead>
              <TableHead className="pr-6 text-right">Conversion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No enquiries in this period.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="pl-6 font-medium">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                <TableCell className="text-right tabular-nums">{r.open}</TableCell>
                <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                <TableCell className="text-right tabular-nums">{r.lost}</TableCell>
                <TableCell className="pr-6 text-right font-medium tabular-nums">
                  {r.rate === null ? "—" : `${r.rate}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Enquiries received in the period, by source and by counsellor. Conversion = won ÷ received. */
export default async function LeadReportPage(props: PageProps<"/admin/leads/report">) {
  const user = await requirePagePermission("leads.view");
  const sp = await props.searchParams;
  const today = istDateOnly(new Date());
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const from = typeof sp.from === "string" && YMD.test(sp.from) ? sp.from : monthStart;
  const to = typeof sp.to === "string" && YMD.test(sp.to) ? sp.to : today.toISOString().slice(0, 10);
  const type = sp.type === "COURSE" || sp.type === "SERVICE" ? sp.type : null;
  const report = await leadReport(user, {
    from: istStart(from),
    to: new Date(istStart(to).getTime() + 86_400_000),
    type,
    activeBranchId: await getActiveBranchId(user),
  });
  const rate = report.total ? Math.round((report.won / report.total) * 1000) / 10 : null;
  return (
    <>
      <PageHeader
        title="Enquiry conversion"
        description="Enquiries received in the period and how many became admissions or job cards."
      />
      <ReportFilters from={from} to={to} type={type} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Enquiries", value: report.total },
          { label: "Won", value: report.won },
          { label: "Lost", value: report.lost },
          { label: "Conversion", value: rate === null ? "—" : `${rate}%` },
        ].map((s) => (
          <Card key={s.label} className="py-4">
            <CardContent>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <RowsTable title="By source" rows={report.bySource} first="Source" />
        <RowsTable title="By counsellor" rows={report.byAssignee} first="Counsellor" />
      </div>
    </>
  );
}
