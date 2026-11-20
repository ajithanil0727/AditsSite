import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveBranchId, requireUser } from "@/modules/auth/current";
import { listIncentives, staffOptions } from "@/modules/hr/hr.queries";
import { can, canAny } from "@/modules/rbac/access";
import { AddIncentiveDialog, IncentivesTable } from "./incentives-view";

/** Current time shifted to IST (read with getUTC*). */
const istNow = () => new Date(Date.now() + 330 * 60_000);

export const metadata: Metadata = { title: "Incentives" };

export default async function IncentivesPage() {
  const user = await requireUser();
  if (!canAny(user.access, ["incentives.manage", "incentives.approve"])) redirect("/admin/no-access");
  const [rows, staff] = await Promise.all([
    listIncentives(user, await getActiveBranchId(user)),
    can(user.access, "incentives.manage") ? staffOptions(user, "incentives.manage") : Promise.resolve([]),
  ]);
  const now = istNow();
  return (
    <>
      <PageHeader
        title="Incentives"
        description="Bonuses added by hand (admissions, repairs, targets). Approved ones are paid with that month's salary."
        actions={
          staff.length > 0 && (
            <AddIncentiveDialog staff={staff} defaults={{ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }} />
          )
        }
      />
      <IncentivesTable rows={rows} canApprove={can(user.access, "incentives.approve")} />
    </>
  );
}
