import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { istDateOnly } from "@/lib/fy";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { batchOptions, courseOptions } from "@/modules/courses/courses.queries";
import { paymentFormOptions } from "@/modules/inventory/inventory.queries";
import { can } from "@/modules/rbac/access";
import { leadForConversion } from "@/modules/leads/leads.queries";
import { admissionBranches } from "@/modules/students/students.queries";
import { AdmissionForm } from "./admission-form";

export const metadata: Metadata = { title: "New admission" };

export default async function NewAdmissionPage(props: PageProps<"/admin/students/new">) {
  const user = await requirePagePermission("students.create");
  const leadId = (await props.searchParams).lead;
  const lead =
    typeof leadId === "string" && can(user.access, "leads.convert")
      ? await leadForConversion(user, leadId, "COURSE")
      : null;
  const [selectable, active] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  const branches = await admissionBranches(user, selectable);
  if (branches.length === 0) redirect("/admin/no-access");
  const ids = branches.map((b) => b.id);
  const [courses, batches, pay] = await Promise.all([
    courseOptions(user.organizationId),
    batchOptions(user.organizationId, ids),
    paymentFormOptions(user.organizationId, ids),
  ]);
  return (
    <>
      <PageHeader
        title="New admission"
        description="Admit a student to a course. Start with their phone number to reuse an existing record."
      />
      <AdmissionForm
        branches={branches.map((b) => ({ value: b.id, label: b.name }))}
        defaultBranchId={
          lead && ids.includes(lead.branchId) ? lead.branchId : active && ids.includes(active) ? active : ids[0]
        }
        courses={courses}
        batches={batches}
        payment={pay}
        today={istDateOnly(new Date()).toISOString().slice(0, 10)}
        limits={{ percent: user.access.discountLimitPercent, amount: user.access.discountLimitAmount }}
        canDiscount={can(user.access, "fees.discount_request")}
        lead={lead}
      />
    </>
  );
}
