import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/format";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { branchOptions, listPayrollRuns } from "@/modules/hr/hr.queries";
import { MONTHS } from "@/modules/hr/hr.schemas";
import { can } from "@/modules/rbac/access";
import { NewPayrollDialog } from "./payroll-controls";
import { STATUS } from "./status";

/** Current time shifted to IST (read with getUTC*). */
const istNow = () => new Date(Date.now() + 330 * 60_000);

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const user = await requirePagePermission("payroll.view");
  const [runs, branches] = await Promise.all([
    listPayrollRuns(user, await getActiveBranchId(user)),
    branchOptions(user, "payroll.run"),
  ]);
  const now = istNow();
  // Default: last month (salaries are usually worked out after the month ends).
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly salaries per branch. Pay = salary ÷ days in the month × paid days, plus incentives, less deductions and advance recovery. No PF/ESI/PT/TDS."
        actions={
          can(user.access, "payroll.run") &&
          branches.length > 0 && (
            <NewPayrollDialog
              branches={branches}
              defaults={{ year: last.getUTCFullYear(), month: last.getUTCMonth() + 1 }}
            />
          )
        }
      />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Staff</TableHead>
              <TableHead className="text-right">Net pay</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No payroll worked out yet.
                </TableCell>
              </TableRow>
            )}
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/admin/hr/payroll/${r.id}`} className="font-medium hover:underline">
                    {MONTHS[r.month - 1]} {r.year}
                  </Link>
                </TableCell>
                <TableCell>{r.branch}</TableCell>
                <TableCell className="text-right tabular-nums">{r.staff}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(r.net)}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
