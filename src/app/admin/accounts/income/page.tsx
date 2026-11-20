import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { istDateOnly } from "@/lib/fy";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listIncome, moneyFormOptions } from "@/modules/accounts/accounts.queries";
import { can } from "@/modules/rbac/access";
import { IncomeTable, NewIncomeDialog } from "./income-view";

export const metadata: Metadata = { title: "Other income" };

export default async function IncomePage(props: PageProps<"/admin/accounts/income">) {
  const user = await requirePagePermission("income.view");
  const params = parseListParams(await props.searchParams);
  const active = await getActiveBranchId(user);
  const [{ rows, total, sumTotal }, options] = await Promise.all([
    listIncome(user, params, active),
    moneyFormOptions(user, "income.create"),
  ]);
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Other income"
        description="Workshops, scrap sales, interest and anything else. Fees and repair payments are recorded automatically."
        actions={
          can(user.access, "income.create") &&
          options.branches.length > 0 && (
            <NewIncomeDialog
              options={options}
              today={today}
              defaultBranchId={
                active && options.branches.some((b) => b.value === active) ? active : options.branches[0].value
              }
            />
          )
        }
      />
      <IncomeTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sumTotal={sumTotal}
        categories={options.incomeCategories}
        canCancel={can(user.access, "income.create")}
      />
    </>
  );
}
