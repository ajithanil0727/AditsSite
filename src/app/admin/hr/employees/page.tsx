import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/fy";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { employeeFormOptions, listEmployees } from "@/modules/hr/hr.queries";
import { can } from "@/modules/rbac/access";
import { EmployeeFormDialog } from "./employee-form";
import { EmployeesTable } from "./employees-table";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage(props: PageProps<"/admin/hr/employees">) {
  const user = await requirePagePermission("employees.view");
  const params = parseListParams(await props.searchParams, { sortable: ["name", "joinDate"] });
  const [{ rows, total }, options, departments] = await Promise.all([
    listEmployees(user, params, await getActiveBranchId(user)),
    employeeFormOptions(user),
    db.department.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff profiles, salaries, leave and documents."
        actions={
          can(user.access, "employees.create") &&
          options.branches.length > 0 && (
            <EmployeeFormDialog
              options={options}
              today={istDateOnly(new Date()).toISOString().slice(0, 10)}
              sensitive={can(user.access, "employees.view_sensitive")}
              trigger={
                <Button>
                  <PlusIcon /> New employee
                </Button>
              }
            />
          )
        }
      />
      <EmployeesTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        departments={departments.map((d) => ({ value: d.id, label: d.name }))}
        canSeeDeleted={can(user.access, "employees.delete")}
      />
    </>
  );
}
