import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { parseListParams } from "@/lib/list-params";
import { listAuditLogs } from "@/modules/audit/audit.queries";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { AuditTable } from "./audit-table";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage(props: PageProps<"/admin/settings/audit-log">) {
  const user = await requirePagePermission("audit.view");
  const params = parseListParams(await props.searchParams, { defaultPageSize: 50 });
  const { rows, total, entityTypes } = await listAuditLogs(user, params, await getActiveBranchId(user));
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what and when: creates, edits, deletes, sign-ins and permission changes."
      />
      <AuditTable rows={rows} total={total} page={params.page} pageSize={params.pageSize} entityTypes={entityTypes} />
    </>
  );
}
