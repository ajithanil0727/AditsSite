import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { istDateOnly } from "@/lib/fy";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { attendanceSheet, branchOptions } from "@/modules/hr/hr.queries";
import { can } from "@/modules/rbac/access";
import { StaffAttendanceSheet } from "./attendance-sheet";

export const metadata: Metadata = { title: "Staff attendance" };

export default async function StaffAttendancePage(props: PageProps<"/admin/hr/attendance">) {
  const user = await requirePagePermission("hr_attendance.view");
  const sp = await props.searchParams;
  const branches = await branchOptions(user, "hr_attendance.view");
  if (branches.length === 0) redirect("/admin/no-access");
  const active = await getActiveBranchId(user);
  const branchId =
    typeof sp.branch === "string" && branches.some((b) => b.value === sp.branch)
      ? sp.branch
      : active && branches.some((b) => b.value === active)
        ? active
        : branches[0].value;
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const sheet = await attendanceSheet(user, branchId, date);
  const canMark =
    (await branchOptions(user, "hr_attendance.mark")).some((b) => b.value === branchId) &&
    can(user.access, "hr_attendance.mark");
  return (
    <>
      <PageHeader
        title="Staff attendance"
        description="Mark everyone once a day. Unmarked working days count as present but are flagged on the payroll."
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/hr/attendance-register">
              <ClipboardListIcon /> Monthly register
            </Link>
          </Button>
        }
      />
      <StaffAttendanceSheet
        key={`${branchId}-${date}`}
        branches={branches}
        branchId={branchId}
        today={today}
        sheet={sheet}
        canMark={canMark}
      />
    </>
  );
}
