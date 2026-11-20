import type { Metadata } from "next";
import { PrinterIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { requirePagePermission } from "@/modules/auth/current";
import { getPayrollRun } from "@/modules/hr/hr.queries";
import { MONTHS } from "@/modules/hr/hr.schemas";
import { canAccessBranch } from "@/modules/rbac/access";
import { RunActions } from "../payroll-controls";
import { STATUS } from "../status";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollRunPage(props: PageProps<"/admin/hr/payroll/[id]">) {
  const user = await requirePagePermission("payroll.view");
  const { id } = await props.params;
  const run = await getPayrollRun(user, id);
  if (!run) notFound();
  const sp = await props.searchParams;
  const skipped = typeof sp.skipped === "string" ? sp.skipped : null;
  return (
    <>
      <PageHeader
        title={`Payroll ${MONTHS[run.month - 1]} ${run.year} · ${run.branch.name}`}
        description={
          run.finalizedAt
            ? `Finalised${run.finalizedBy ? ` by ${run.finalizedBy}` : ""} on ${formatDateTime(run.finalizedAt)}.`
            : "Draft: change attendance, leave or salaries and work it out again until it's right."
        }
        actions={
          <RunActions
            run={{
              id: run.id,
              branchId: run.branch.id,
              year: run.year,
              month: run.month,
              status: run.status,
              unmarked: run.totals.unmarked,
            }}
            perms={{
              run: canAccessBranch(user.access, "payroll.run", run.branch.id),
              finalize: canAccessBranch(user.access, "payroll.finalize", run.branch.id),
              pay: canAccessBranch(user.access, "payroll.mark_paid", run.branch.id),
            }}
            accounts={run.accounts}
            today={istDateOnly(new Date()).toISOString().slice(0, 10)}
          />
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={STATUS[run.status].tone}>{STATUS[run.status].label}</StatusBadge>
        {run.totals.unmarked > 0 && run.status === "DRAFT" && (
          <StatusBadge tone="peach">{run.totals.unmarked} unmarked working day(s) counted as present</StatusBadge>
        )}
      </div>
      {skipped && (
        <p className="mb-4 rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
          Skipped (no salary set): {skipped}. Set their salary on the employee page and work it out again.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Paid days</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead className="text-right">Loss of pay</TableHead>
              <TableHead className="text-right">Incentives</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net pay</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.slips.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No payslips.
                </TableCell>
              </TableRow>
            )}
            {run.slips.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/admin/hr/employees/${s.employeeId}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {s.code}
                    {s.unmarked ? ` · ${s.unmarked} unmarked` : ""}
                    {s.paid ? " · paid" : ""}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.paidDays} / {s.daysInMonth}
                  {s.lopDays > 0 && <span className="block text-xs text-destructive">{s.lopDays} LOP</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(s.gross)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.lop ? `−${formatINR(s.lop)}` : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.incentives ? formatINR(s.incentives) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.deductions || s.advance ? `−${formatINR(s.deductions + s.advance)}` : "—"}
                  {s.advance > 0 && (
                    <span className="block text-xs text-muted-foreground">advance {formatINR(s.advance)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatINR(s.net)}</TableCell>
                <TableCell>
                  <Link
                    href={`/print/payslip/${s.id}`}
                    target="_blank"
                    aria-label={`Payslip for ${s.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <PrinterIcon className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {run.slips.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-medium tabular-nums">{formatINR(run.totals.gross)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">−{formatINR(run.totals.lop)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatINR(run.totals.incentives)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  −{formatINR(run.totals.deductions)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatINR(run.totals.net)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </>
  );
}
