import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { financialYear } from "@/lib/fy";
import { getActiveBranchId, getSelectableBranches, requirePagePermission } from "@/modules/auth/current";
import { DOC_TYPE_LABELS, GST_DOC_TYPES, formatDocNumber } from "@/modules/numbering/format";
import { can } from "@/modules/rbac/access";
import { listNumberSeries } from "@/modules/settings/number-series.service";
import { BranchPicker } from "./branch-picker";
import { NumberSeriesDialog } from "./number-series-dialog";

export const metadata: Metadata = { title: "Number series" };

export default async function NumberSeriesPage(props: PageProps<"/admin/settings/number-series">) {
  const user = await requirePagePermission("settings.view");
  const sp = await props.searchParams;
  const [branches, activeBranchId] = await Promise.all([getSelectableBranches(user), getActiveBranchId(user)]);
  const requested = typeof sp.branch === "string" ? sp.branch : null;
  const branchId = branches.find((b) => b.id === requested)?.id ?? activeBranchId ?? branches[0]?.id;
  const rows = branchId ? await listNumberSeries(user, branchId) : [];
  const canEdit = can(user.access, "settings.update");
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Number series"
        description={`Per branch, reset every financial year on 1 April. Current FY: ${financialYear(now)}. GST invoice numbers must be 16 characters or fewer.`}
        actions={<BranchPicker branches={branches} value={branchId ?? ""} />}
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Next number</TableHead>
              <TableHead className="hidden md:table-cell">Resets</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const next = formatDocNumber({
                format: r.format,
                branchCode: r.branchCode,
                date: now,
                seq: r.nextNumber,
                padding: r.padding,
              });
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    {DOC_TYPE_LABELS[r.docType]}
                    {GST_DOC_TYPES.includes(r.docType) && (
                      <Badge variant="outline" className="ml-2">
                        GST ≤16
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.format}</TableCell>
                  <TableCell className="font-mono text-sm">{next}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.resetPolicy === "NEVER" ? "Never" : "Each FY"}
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <NumberSeriesDialog
                        row={{
                          id: r.id,
                          docType: r.docType,
                          branchCode: r.branchCode,
                          format: r.format,
                          padding: r.padding,
                          nextNumber: r.nextNumber,
                          resetPolicy: r.resetPolicy,
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Tokens: <code>{"{BRANCH}"}</code> branch code, <code>{"{FY}"}</code> 26-27, <code>{"{FYS}"}</code> 2627,{" "}
        <code>{"{SEQ}"}</code> running number.
      </p>
    </>
  );
}
