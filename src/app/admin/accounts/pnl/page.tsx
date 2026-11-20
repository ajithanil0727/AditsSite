import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import type { PnlLine } from "@/modules/accounts/pnl-logic";
import { pnlReport } from "@/modules/accounts/pnl.queries";
import { PeriodPicker } from "../period-picker";
import { parsePeriod } from "../period";

export const metadata: Metadata = { title: "Profit & loss" };

const rupees = (paise: number) => formatINR(paise / 100);

export default async function PnlPage(props: PageProps<"/admin/accounts/pnl">) {
  const user = await requirePagePermission("reports.financial");
  const { from, to, presets } = parsePeriod(await props.searchParams);
  const report = await pnlReport(user, { from, to, activeBranchId: await getActiveBranchId(user) });
  const multi = report.branches.length > 1;
  const cols = [
    ...report.branches.map((b) => ({ key: b.id, label: b.name, pnl: b.pnl })),
    ...(multi ? [{ key: "all", label: "Combined", pnl: report.combined }] : []),
  ];

  // Every line that appears in any column, in the combined order.
  const order: PnlLine[] = [];
  for (const l of [...report.combined.lines, ...report.branches.flatMap((b) => b.pnl.lines)])
    if (!order.some((o) => o.key === l.key)) order.push(l);
  const value = (pnl: { lines: PnlLine[] }, key: string) => pnl.lines.find((l) => l.key === key)?.amount ?? 0;
  const section = (s: "income" | "cost") => order.filter((l) => l.section === s);

  return (
    <>
      <PageHeader
        title="Profit & loss"
        description={`${formatDate(from)} to ${formatDate(to)}. Fees count when received, repairs when invoiced (before GST), parts when used in a repair, expenses once approved.`}
        actions={
          <Button asChild variant="outline">
            <a href={`/api/export/pnl?${new URLSearchParams({ from, to })}`}>
              <DownloadIcon /> Excel
            </a>
          </Button>
        }
      />
      <PeriodPicker from={from} to={to} presets={presets} />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56" />
              {cols.map((c) => (
                <TableHead key={c.key} className={cn("text-right", c.key === "all" && "bg-muted/50")}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(["income", "cost"] as const).map((s) => (
              <SectionRows
                key={s}
                title={s === "income" ? "Income" : "Costs"}
                lines={section(s)}
                cols={cols}
                value={value}
                total={(p) => (s === "income" ? p.income : p.costs)}
              />
            ))}
            <TableRow className="border-t-2 hover:bg-transparent">
              <TableCell className="text-base font-semibold">Net profit</TableCell>
              {cols.map((c) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    "text-right text-base font-semibold tabular-nums",
                    c.pnl.net < 0 && "text-destructive",
                    c.key === "all" && "bg-muted/50",
                  )}
                >
                  {rupees(c.pnl.net)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Salaries are included once entered as expenses (payroll comes in a later phase). GST collected and input GST on
        a registered branch&apos;s bills aren&apos;t income or cost.
      </p>
    </>
  );
}

function SectionRows({
  title,
  lines,
  cols,
  value,
  total,
}: {
  title: string;
  lines: PnlLine[];
  cols: { key: string; pnl: { lines: PnlLine[]; income: number; costs: number } }[];
  value: (pnl: { lines: PnlLine[] }, key: string) => number;
  total: (pnl: { income: number; costs: number }) => number;
}) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell
          colSpan={cols.length + 1}
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </TableCell>
      </TableRow>
      {lines.map((l) => (
        <TableRow key={l.key}>
          <TableCell className="pl-6">{l.label}</TableCell>
          {cols.map((c) => (
            <TableCell key={c.key} className={cn("text-right tabular-nums", c.key === "all" && "bg-muted/50")}>
              {rupees(value(c.pnl, l.key))}
            </TableCell>
          ))}
        </TableRow>
      ))}
      <TableRow>
        <TableCell className="font-medium">Total {title.toLowerCase()}</TableCell>
        {cols.map((c) => (
          <TableCell
            key={c.key}
            className={cn("text-right font-medium tabular-nums", c.key === "all" && "bg-muted/50")}
          >
            {rupees(total(c.pnl))}
          </TableCell>
        ))}
      </TableRow>
    </>
  );
}
