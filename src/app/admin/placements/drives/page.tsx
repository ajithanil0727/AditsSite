import type { Metadata } from "next";
import Link from "next/link";
import { UrlSelectFilter } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { driveFormOptions, listDrives } from "@/modules/placements/placements.queries";
import { DRIVE_STATUSES, DRIVE_STATUS_LABELS } from "@/modules/placements/placements.schemas";
import { can } from "@/modules/rbac/access";
import { DriveDialog } from "./drive-form";

export const metadata: Metadata = { title: "Placement drives" };

const TONE = { OPEN: "mint", CLOSED: "neutral", CANCELLED: "danger" } as const;

export default async function DrivesPage(props: PageProps<"/admin/placements/drives">) {
  const user = await requirePagePermission("placements.view");
  const sp = await props.searchParams;
  const status = typeof sp.f_status === "string" ? sp.f_status : null;
  const [rows, options] = await Promise.all([
    listDrives(user, { activeBranchId: await getActiveBranchId(user), status }),
    can(user.access, "placements.manage_drives") ? driveFormOptions(user) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        title="Placement drives"
        description="Job openings and hiring drives. Put students forward, record interview rounds, offers and joining."
        actions={
          options &&
          options.companies.length > 0 &&
          (options.branches.length > 0 || options.allBranches) && <DriveDialog options={options} />
        }
      />
      {options && options.companies.length === 0 && (
        <p className="mb-4 rounded-md bg-sky px-3 py-2 text-sm text-sky-foreground">
          Add a hiring company first (
          <Link href="/admin/placements/companies" className="underline">
            Companies
          </Link>
          ).
        </p>
      )}
      <div className="mb-3">
        <UrlSelectFilter
          name="status"
          placeholder="Any status"
          options={DRIVE_STATUSES.map((s) => ({ value: s, label: DRIVE_STATUS_LABELS[s] }))}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Drive</TableHead>
              <TableHead>For</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead className="text-right">Placed</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No drives yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link href={`/admin/placements/drives/${d.id}`} className="font-medium hover:underline">
                    {d.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {d.company} · {d.jobRole}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {d.branch}
                  <div className="text-xs text-muted-foreground">{d.courses}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{d.driveDate ? formatDate(d.driveDate) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{d.applicants}</TableCell>
                <TableCell className="text-right tabular-nums">{d.placed}</TableCell>
                <TableCell>
                  <StatusBadge tone={TONE[d.status]}>{DRIVE_STATUS_LABELS[d.status]}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
