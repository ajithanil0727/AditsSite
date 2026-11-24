import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendanceRegisterTable } from "@/components/reports/attendance-register-table";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { getAttendanceRegister, MARK_LEGEND } from "@/modules/courses/attendance-register";
import { getCompanyProfile } from "@/modules/settings/settings.service";

export const metadata: Metadata = { title: "Attendance register" };

/** Printable register (A4 landscape). */
export default async function PrintAttendanceRegisterPage(props: PageProps<"/print/attendance-register">) {
  const user = await requirePagePermission("student_attendance.view");
  const sp = await props.searchParams;
  const batchId = typeof sp.batch === "string" ? sp.batch : "";
  const r = batchId ? await getAttendanceRegister(user, batchId, typeof sp.month === "string" ? sp.month : null) : null;
  if (!r) notFound();
  const company = await getCompanyProfile(user.organizationId);
  return (
    <>
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      <article className="mx-auto max-w-[297mm] bg-card p-6 text-card-foreground shadow-sm print:p-0 print:shadow-none">
        <header className="mb-3 flex items-start justify-between gap-4 border-b pb-2">
          <div>
            <div className="font-bold">{company.legalName || company.name}</div>
            <div className="text-lg font-semibold">Attendance register · {r.period.label}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{r.batch.name}</div>
            <div className="text-muted-foreground">
              {r.batch.course} · {r.batch.branch} · {r.batch.timing}
              {r.batch.trainer ? ` · ${r.batch.trainer}` : ""}
            </div>
          </div>
        </header>
        <AttendanceRegisterTable r={r} compact />
        <footer className="mt-3 flex justify-between gap-4 text-[10px] text-muted-foreground">
          <span>{MARK_LEGEND}</span>
          <span className="whitespace-nowrap">
            Printed {formatDateTime(new Date())} by {user.name}
          </span>
        </footer>
      </article>
    </>
  );
}
