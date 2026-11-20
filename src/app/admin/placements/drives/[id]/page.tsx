import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatINR } from "@/lib/format";
import { istDateOnly } from "@/lib/fy";
import { requirePagePermission } from "@/modules/auth/current";
import { driveFormOptions, getDrive } from "@/modules/placements/placements.queries";
import { DRIVE_STATUS_LABELS } from "@/modules/placements/placements.schemas";
import { can } from "@/modules/rbac/access";
import { DriveDialog } from "../drive-form";
import { AddApplicantsDialog, ApplicationsTable, DeleteDriveButton } from "./drive-view";

export const metadata: Metadata = { title: "Placement drive" };

const TONE = { OPEN: "mint", CLOSED: "neutral", CANCELLED: "danger" } as const;

export default async function DrivePage(props: PageProps<"/admin/placements/drives/[id]">) {
  const user = await requirePagePermission("placements.view");
  const { id } = await props.params;
  const d = await getDrive(user, id);
  if (!d) notFound();
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const options = d.canManageDrive ? await driveFormOptions(user) : null;
  const canApply = can(user.access, "placements.manage_applications") && d.status === "OPEN";
  const placed = d.applications.filter((a) => a.offer && a.offer.joiningStatus !== "DECLINED").length;
  const salary =
    d.salaryMin !== null || d.salaryMax !== null
      ? [d.salaryMin, d.salaryMax]
          .filter((x) => x !== null)
          .map((x) => formatINR(x!))
          .join(" – ") + " / month"
      : null;

  return (
    <>
      <PageHeader
        title={d.title}
        description={`${d.company.name} · ${d.jobRole} · ${d.branch}`}
        actions={
          <>
            <StatusBadge tone={TONE[d.status]}>{DRIVE_STATUS_LABELS[d.status]}</StatusBadge>
            {options && (
              <DriveDialog
                options={options}
                initial={{
                  id: d.id,
                  companyId: d.companyId,
                  branchId: d.branchId ?? "__all",
                  title: d.title,
                  jobRole: d.jobRole,
                  description: d.description ?? "",
                  location: d.location ?? "",
                  salaryMin: d.salaryMin ?? "",
                  salaryMax: d.salaryMax ?? "",
                  driveDate: d.driveDate ?? "",
                  lastDateToApply: d.lastDateToApply ?? "",
                  courseIds: d.courses.map((c) => c.id),
                  status: d.status,
                }}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
              />
            )}
            {options && d.applications.length === 0 && <DeleteDriveButton id={d.id} />}
            {canApply && <AddApplicantsDialog driveId={d.id} eligible={d.eligible} />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Students ({d.applications.length})</h2>
            <span className="text-sm text-muted-foreground">{placed} placed</span>
          </div>
          <ApplicationsTable rows={d.applications} today={today} jobRole={d.jobRole} />
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Courses</dt>
              <dd>{d.courses.length ? d.courses.map((c) => c.name).join(", ") : "Any course"}</dd>
              {d.location && (
                <>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd>{d.location}</dd>
                </>
              )}
              {salary && (
                <>
                  <dt className="text-muted-foreground">Salary</dt>
                  <dd>{salary}</dd>
                </>
              )}
              {d.driveDate && (
                <>
                  <dt className="text-muted-foreground">Drive date</dt>
                  <dd>{formatDate(d.driveDate)}</dd>
                </>
              )}
              {d.lastDateToApply && (
                <>
                  <dt className="text-muted-foreground">Apply by</dt>
                  <dd>{formatDate(d.lastDateToApply)}</dd>
                </>
              )}
            </dl>
            {d.description && <p className="mt-3 text-sm whitespace-pre-line">{d.description}</p>}
            {d.company.contacts.length > 0 && (
              <div className="mt-4 border-t pt-3 text-sm">
                <div className="mb-1 font-medium">Contacts</div>
                {d.company.contacts.map((c) => (
                  <div key={c.id}>
                    {c.name}
                    {c.designation ? ` (${c.designation})` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                    {c.email ? ` · ${c.email}` : ""}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-sm">
              <Link href="/admin/placements/drives" className="text-muted-foreground underline hover:text-foreground">
                All drives
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
