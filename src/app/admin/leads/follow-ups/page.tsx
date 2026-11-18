import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { parseListParams } from "@/lib/list-params";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listLeads } from "@/modules/leads/leads.queries";
import { can } from "@/modules/rbac/access";
import { LeadsTable } from "../leads-table";
import { leadPageOptions } from "../shared";

export const metadata: Metadata = { title: "Follow-ups" };

/** Open enquiries whose follow-up is due today or overdue, oldest first. Counsellors see their own by default. */
export default async function FollowUpsPage(props: PageProps<"/admin/leads/follow-ups">) {
  const user = await requirePagePermission("leads.view");
  const sp = await props.searchParams;
  const params = parseListParams(
    {
      f_follow: "due",
      ...(can(user.access, "leads.assign") ? {} : { f_assignee: "me" }),
      sort: "followUp",
      ...sp,
    },
    { sortable: ["name", "followUp"] },
  );
  params.filters.state = "open";
  const [{ rows, total }, opts] = await Promise.all([
    listLeads(user, params, await getActiveBranchId(user)),
    leadPageOptions(user),
  ]);
  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Calls to make today and anything overdue. Log each call on the enquiry with the next date."
      />
      <LeadsTable
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        statuses={opts.statuses.filter((s) => !s.isWon && !s.isLost).map((s) => ({ value: s.value, label: s.label }))}
        sources={opts.sources}
        assignees={opts.assignees.map((a) => ({ value: a.value, label: a.label }))}
        showStateFilter={false}
      />
    </>
  );
}
