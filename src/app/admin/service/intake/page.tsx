import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { paymentFormOptions } from "@/modules/inventory/inventory.queries";
import { can, canAccessBranch } from "@/modules/rbac/access";
import { leadForConversion } from "@/modules/leads/leads.queries";
import { engineerOptions, intakeOptions } from "@/modules/service/jobs.queries";
import { IntakeForm } from "./intake-form";

export const metadata: Metadata = { title: "New intake" };

export default async function IntakePage(props: PageProps<"/admin/service/intake">) {
  const user = await requirePagePermission("jobcards.create");
  const leadId = (await props.searchParams).lead;
  const lead =
    typeof leadId === "string" && can(user.access, "leads.convert")
      ? await leadForConversion(user, leadId, "SERVICE")
      : null;
  const [all, active] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  // Only branches that run a service centre take in devices (not the head office or institute-only branches).
  const serviceBranchIds = new Set(
    (
      await db.branch.findMany({
        where: { id: { in: all.map((b) => b.id) }, kind: { in: ["SERVICE", "BOTH"] } },
        select: { id: true },
      })
    ).map((b) => b.id),
  );
  const branches = all.filter(
    (b) => serviceBranchIds.has(b.id) && canAccessBranch(user.access, "jobcards.create", b.id),
  );
  if (branches.length === 0) redirect("/admin/no-access");
  const ids = branches.map((b) => b.id);
  const [opts, engineers, pay] = await Promise.all([
    intakeOptions(user.organizationId),
    can(user.access, "jobcards.assign") ? engineerOptions(user.organizationId, ids) : Promise.resolve([]),
    paymentFormOptions(user.organizationId, ids),
  ]);
  return (
    <>
      <PageHeader title="New intake" description="Receive a device. Start with the customer's phone number." />
      <IntakeForm
        branches={branches.map((b) => ({ value: b.id, label: b.name }))}
        defaultBranchId={
          lead && ids.includes(lead.branchId) ? lead.branchId : active && ids.includes(active) ? active : ids[0]
        }
        options={opts}
        engineers={engineers}
        payment={pay}
        lead={lead}
      />
    </>
  );
}
