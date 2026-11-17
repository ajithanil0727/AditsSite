import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { partPickerOptions, vendorOptions } from "@/modules/inventory/inventory.queries";
import { canAccessBranch } from "@/modules/rbac/access";
import { PurchaseForm } from "../purchase-form";

export const metadata: Metadata = { title: "New purchase" };

const todayYmd = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default async function NewPurchasePage() {
  const user = await requirePagePermission("purchases.create");
  const [mine, active] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  const branches = mine.filter((b) => canAccessBranch(user.access, "purchases.create", b.id));
  if (branches.length === 0) redirect("/admin/no-access");
  const [vendors, parts, unregistered] = await Promise.all([
    vendorOptions(user.organizationId),
    partPickerOptions(user.organizationId, null),
    db.branch.findMany({
      where: { id: { in: branches.map((b) => b.id) }, gstRegistrationId: null },
      select: { id: true },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="New purchase"
        description="Enter the vendor's bill. Save it as a draft, then post it to add the stock."
      />
      <PurchaseForm
        initial={{
          branchId: active && branches.some((b) => b.id === active) ? active : branches[0].id,
          vendorId: "",
          billNo: "",
          billDate: todayYmd(),
          notes: "",
          items: [{ partId: "", qty: "1", unitCost: "", taxRate: "18" }],
        }}
        branches={branches.map((b) => ({ value: b.id, label: b.name }))}
        vendors={vendors}
        parts={parts}
        unregisteredBranchIds={unregistered.map((b) => b.id)}
      />
    </>
  );
}
