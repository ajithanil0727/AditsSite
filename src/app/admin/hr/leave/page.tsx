import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { istDateOnly } from "@/lib/fy";
import { getActiveBranchId, requireUser } from "@/modules/auth/current";
import { leaveFormOptions, listLeave } from "@/modules/hr/hr.queries";
import { can, canAny } from "@/modules/rbac/access";
import { redirect } from "next/navigation";
import { UrlSelectFilter } from "@/components/data-table/data-table";
import { ApplyLeaveDialog, LeaveTable } from "./leave-view";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage(props: PageProps<"/admin/hr/leave">) {
  const user = await requireUser();
  if (!canAny(user.access, ["leaves.apply", "leaves.approve"])) redirect("/admin/no-access");
  const sp = await props.searchParams;
  const status = typeof sp.f_status === "string" ? sp.f_status : null;
  const [{ rows, approver, ownEmployeeId }, options] = await Promise.all([
    listLeave(user, { status, activeBranchId: await getActiveBranchId(user) }),
    leaveFormOptions(user),
  ]);
  const canApply = can(user.access, "leaves.apply") && options.staff.length > 0;
  return (
    <>
      <PageHeader
        title="Leave"
        description={
          approver
            ? "Requests from your branches. Paid leave comes out of the yearly balance (April–March); the rest is loss of pay."
            : "Your leave requests."
        }
        actions={
          canApply && (
            <ApplyLeaveDialog
              types={options.types}
              staff={options.staff}
              defaultEmployeeId={ownEmployeeId}
              today={istDateOnly(new Date()).toISOString().slice(0, 10)}
            />
          )
        }
      />
      {!canApply && !approver && (
        <p className="mb-4 rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
          Your login isn&apos;t linked to an employee record yet. Ask HR to link it.
        </p>
      )}
      <div className="mb-4">
        <UrlSelectFilter
          name="status"
          placeholder="All requests"
          options={[
            { value: "PENDING", label: "Waiting" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
      </div>
      <LeaveTable rows={rows} approver={approver} />
    </>
  );
}
