import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { listHolidays } from "@/modules/hr/hr.queries";
import { leaveYear } from "@/modules/hr/payroll-logic";
import { can } from "@/modules/rbac/access";
import { DeleteHoliday, HolidayDialog, YearPicker } from "./holiday-controls";

export const metadata: Metadata = { title: "Holidays" };

export default async function HolidaysPage(props: PageProps<"/admin/hr/holidays">) {
  const user = await requirePagePermission("hr_attendance.view");
  const sp = await props.searchParams;
  const current = leaveYear(new Date());
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : current;
  const [holidays, branches] = await Promise.all([
    listHolidays(user.organizationId, year),
    db.branch.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  const manage = can(user.access, "masters.hr");
  const branchOpts = branches.map((b) => ({ value: b.id, label: b.name }));
  return (
    <>
      <PageHeader
        title="Holidays"
        description="Paid holidays, for all branches or one. Sundays are always the weekly off."
        actions={
          <>
            <YearPicker year={year} current={current} />
            {manage && <HolidayDialog branches={branchOpts} />}
          </>
        }
      />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Holiday</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No holidays for April {year} – March {year + 1}.
                </TableCell>
              </TableRow>
            )}
            {holidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="whitespace-nowrap">{formatDate(h.date)}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>{h.branch}</TableCell>
                <TableCell className="text-right">
                  {manage && (
                    <div className="flex justify-end gap-1">
                      <HolidayDialog
                        branches={branchOpts}
                        initial={{ id: h.id, date: h.date, name: h.name, branchId: h.branchId }}
                      />
                      <DeleteHoliday id={h.id} name={h.name} />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
