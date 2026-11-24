import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { AttendanceRegisterTable } from "@/components/reports/attendance-register-table";
import { Button } from "@/components/ui/button";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import {
  getAttendanceRegister,
  MARK_LEGEND,
  parseMonth,
  registerBatchOptions,
} from "@/modules/courses/attendance-register";

export const metadata: Metadata = { title: "Attendance register" };

/** Student attendance register: pick a batch and a month; view, print or download Excel. */
export default async function AttendanceRegisterPage(props: PageProps<"/admin/attendance-register">) {
  const user = await requirePagePermission("student_attendance.view");
  const sp = await props.searchParams;
  const batches = await registerBatchOptions(user, await getActiveBranchId(user));
  const batchId =
    typeof sp.batch === "string" && batches.some((b) => b.value === sp.batch) ? sp.batch : (batches[0]?.value ?? null);
  const month = parseMonth(typeof sp.month === "string" ? sp.month : null).month;
  const register = batchId ? await getAttendanceRegister(user, batchId, month) : null;
  const qs = batchId ? new URLSearchParams({ batch: batchId, month }).toString() : "";

  return (
    <>
      <PageHeader
        title="Attendance register"
        description="Students down the side, class days across the top, with totals and attendance %."
        actions={
          register && (
            <>
              <Button variant="outline" asChild>
                <a href={`/print/attendance-register?${qs}`} target="_blank" rel="noreferrer">
                  <PrinterIcon /> Print / PDF
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/api/attendance-register?${qs}`}>
                  <DownloadIcon /> Excel
                </a>
              </Button>
            </>
          )
        }
      />
      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no batches you can see.</p>
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/attendance-register">
            <label className="grid gap-1 text-sm">
              Batch
              <select
                name="batch"
                defaultValue={batchId ?? ""}
                className="h-9 min-w-64 rounded-md border bg-background px-2"
              >
                {batches.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                    {b.status === "COMPLETED" ? " · completed" : ""}
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
                <Link href={`/admin/batches/${register.batch.id}`} className="underline hover:text-foreground">
                  {register.batch.name}
                </Link>{" "}
                · {register.batch.course} · {register.batch.branch} · {register.period.label} · {register.days.length}{" "}
                class day(s)
              </p>
              <div className="overflow-x-auto rounded-xl border bg-card p-2">
                <AttendanceRegisterTable r={register} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{MARK_LEGEND}</p>
            </>
          )}
        </>
      )}
    </>
  );
}
