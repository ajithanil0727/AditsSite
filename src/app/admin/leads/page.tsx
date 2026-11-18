import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listLeads } from "@/modules/leads/leads.queries";
import { can } from "@/modules/rbac/access";
import { LeadFormDialog } from "./lead-form";
import { LeadsTable } from "./leads-table";
import { leadPageOptions } from "./shared";

export const metadata: Metadata = { title: "Enquiries" };

export default async function LeadsPage(props: PageProps<"/admin/leads">) {
  const user = await requirePagePermission("leads.view");
  const params = parseListParams(await props.searchParams, { sortable: ["name", "followUp"] });
  if (params.showDeleted && !can(user.access, "leads.delete")) params.showDeleted = false;
  const [{ rows, total }, opts] = await Promise.all([
    listLeads(user, params, await getActiveBranchId(user)),
    leadPageOptions(user),
  ]);
  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Course and repair leads from the website, walk-ins, phone calls and referrals."
        actions={
          can(user.access, "leads.create") &&
          opts.form.branches.length > 0 && (
            <LeadFormDialog
              options={opts.form}
              trigger={
                <Button>
                  <PlusIcon /> New enquiry
                </Button>
              }
            />
          )
        }
      />
      <LeadsTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        statuses={opts.statuses.map((s) => ({ value: s.value, label: s.label }))}
        sources={opts.sources}
        assignees={opts.assignees.map((a) => ({ value: a.value, label: a.label }))}
        canSeeDeleted={can(user.access, "leads.delete")}
      />
    </>
  );
}
