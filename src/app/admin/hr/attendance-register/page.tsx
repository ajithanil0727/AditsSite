import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StaffRegisterTable } from "@/components/reports/staff-register-table";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { parseMonth } from "@/modules/courses/attendance-register";
import { getStaffRegister, STAFF_LEGEND, staffRegisterBranches } from "@/modules/hr/staff-register";

export const metadata: Metadata = { title: "Staff attendance register" };

/** Staff attendance register: pick a branch and a month; view, print or download Excel. Totals follow the payroll rules. */
export default async function StaffAttendanceRegisterPage(props: PageProps<"/admin/hr/attendance-register">) {
  const user = await requirePagePermission("hr_attendance.view");
  const sp = await props.searchParams;
  const branches = await staffRegisterBranches(user);
  const active = await getActiveBranchId(user);
  const branchId =
    typeof sp.branch === "string" && branches.some((b) => b.value === sp.branch)
      ? sp.branch
      : (branches.find((b) => b.value === active)?.value ?? branches[0]?.value ?? null);
  const month = parseMonth(typeof sp.month === "string" ? sp.month : null).month;
  const register = branchId ? await getStaffRegister(user, branchId, month) : null;
  const qs = branchId ? new URLSearchParams({ branch: branchId, month }).toString() : "";

  return (
    <>
      <PageHeader
        title="Staff attendance register"
        description="Employees down the side, every day of the month across. Loss-of-pay and paid days follow the payroll rules."
        actions={
          register && (
            <>
              <Button variant="outline" asChild>
                <a href={`/print/staff-attendance?${qs}`} target="_blank" rel="noreferrer">
                  <PrinterIcon /> Print / PDF
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/staff-attendance?${qs}`}>
                  <DownloadIcon /> Excel
                </a>
              </Button>
            </>
          )
        }
      />
      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no branches you can see.</p>
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/hr/attendance-register">
            <label className="grid gap-1 text-sm">
              Branch
              <select
                name="branch"
                defaultValue={branchId ?? ""}
                className="h-9 min-w-48 rounded-md border bg-background px-2"
              >
                {branches.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Month
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="h-9 rounded-md border bg-background px-2"
              />
            </label>
            <Button type="submit">Show</Button>
          </form>
          {register && (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                {register.branch.name} · {register.period.label}
                {register.upTo ? ` · totals up to ${formatDate(register.upTo)}` : ""} ·{" "}
                <Link href="/admin/hr/attendance" className="underline hover:text-foreground">
                  Mark attendance
                </Link>
              </p>
              <div className="overflow-x-auto rounded-xl border bg-card p-2">
                <StaffRegisterTable r={register} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{STAFF_LEGEND}</p>
            </>
          )}
        </>
      )}
    </>
  );
}
