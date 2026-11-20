import type { Metadata } from "next";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { istDateOnly } from "@/lib/fy";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listExpenses, moneyFormOptions } from "@/modules/accounts/accounts.queries";
import { getAccountsSettings } from "@/modules/accounts/accounts.service";
import { can } from "@/modules/rbac/access";
import { ApprovalLimitForm } from "./approval-limit";
import { NewExpenseDialog } from "./expense-dialogs";
import { ExpensesTable } from "./expenses-table";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage(props: PageProps<"/admin/accounts/expenses">) {
  const user = await requirePagePermission("expenses.view");
  const params = parseListParams(await props.searchParams);
  const active = await getActiveBranchId(user);
  const [{ rows, total, sumTotal }, options, settings] = await Promise.all([
    listExpenses(user, params, active),
    moneyFormOptions(user, "expenses.create"),
    getAccountsSettings(user.organizationId),
  ]);
  const today = istDateOnly(new Date()).toISOString().slice(0, 10);
  const canApprove = can(user.access, "expenses.approve");
  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Rent, bills, salaries and other costs. Above ₹${settings.expenseApprovalLimit.toLocaleString("en-IN")} they wait for approval before they count or can be paid.`}
        actions={
          <>
            <Button asChild variant="outline">
              <a
                href={`/api/export/expenses?${new URLSearchParams(Object.entries(params.filters).map(([k, v]) => [`f_${k}`, v]))}`}
              >
                <DownloadIcon /> Excel
              </a>
            </Button>
            {can(user.access, "settings.update") && <ApprovalLimitForm limit={settings.expenseApprovalLimit} />}
            {can(user.access, "expenses.create") && options.branches.length > 0 && (
              <NewExpenseDialog
                options={options}
                today={today}
                defaultBranchId={
                  active && options.branches.some((b) => b.value === active) ? active : options.branches[0].value
                }
                limit={settings.expenseApprovalLimit}
                canApprove={canApprove}
                trigger={
                  <Button>
                    <PlusIcon /> New expense
                  </Button>
                }
              />
            )}
          </>
        }
      />
      <ExpensesTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sumTotal={sumTotal}
        options={options}
        today={today}
        me={user.id}
        perms={{
          approve: canApprove,
          pay: can(user.access, "expenses.pay"),
          create: can(user.access, "expenses.create"),
        }}
      />
    </>
  );
}
