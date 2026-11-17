import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { partPickerOptions } from "@/modules/inventory/inventory.queries";
import { canAccessBranch } from "@/modules/rbac/access";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "New transfer" };

export default async function NewTransferPage(props: PageProps<"/admin/inventory/transfers/new">) {
  const user = await requirePagePermission("inventory.transfer");
  const [mine, active] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  const from = mine.filter((b) => canAccessBranch(user.access, "inventory.transfer", b.id));
  if (from.length === 0) redirect("/admin/no-access");
  const sp = await props.searchParams;
  const fromId =
    (typeof sp.from === "string" && from.some((b) => b.id === sp.from) ? sp.from : null) ?? active ?? from[0].id;
  const [all, parts] = await Promise.all([
    db.branch.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    partPickerOptions(user.organizationId, fromId),
  ]);
  return (
    <>
      <PageHeader
        title="New stock transfer"
        description="Pick the parts to send. Stock leaves the sending branch when you dispatch."
      />
      <TransferForm fromBranches={from} allBranches={all} fromId={fromId} parts={parts} />
    </>
  );
}
