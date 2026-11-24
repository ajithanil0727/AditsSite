import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaffRegisterTable } from "@/components/reports/staff-register-table";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { getStaffRegister, STAFF_LEGEND } from "@/modules/hr/staff-register";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Staff attendance register" };

/** Printable staff register (A4 landscape). */
export default async function PrintStaffAttendancePage(props: PageProps<"/print/staff-attendance">) {
  const user = await requirePagePermission("hr_attendance.view");
  const sp = await props.searchParams;
  const branchId = typeof sp.branch === "string" ? sp.branch : "";
  const r = branchId ? await getStaffRegister(user, branchId, typeof sp.month === "string" ? sp.month : null) : null;
  if (!r) notFound();
  const company = await getCompanyProfile(user.organizationId);
  return (
    <>
      <style>{"@page { size: A4 landscape; margin: 8mm; }"}</style>
      <article className="mx-auto max-w-[297mm] bg-card p-6 text-card-foreground shadow-sm print:p-0 print:shadow-none">
        <header className="mb-3 flex items-start justify-between gap-4 border-b pb-2">
          <div>
            <div className="font-bold">{company.legalName || company.name}</div>
            <div className="text-lg font-semibold">Staff attendance register · {r.period.label}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{r.branch.name}</div>
            {r.upTo && <div className="text-muted-foreground">Totals up to {formatDate(r.upTo)}</div>}
          </div>
        </header>
        <StaffRegisterTable r={r} compact />
        <footer className="mt-3 flex justify-between gap-4 text-[9px] text-muted-foreground">
          <span>{STAFF_LEGEND}</span>
          <span className="whitespace-nowrap">
            Printed {formatDateTime(new Date())} by {user.name}
          </span>
        </footer>
      </article>
    </>
  );
}
