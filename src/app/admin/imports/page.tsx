import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/modules/auth/current";
import { IMPORT_ENTITIES, IMPORT_SPECS } from "@/modules/imports/import-logic";
import { can } from "@/modules/rbac/access";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage() {
  const user = await requireUser();
  const entities = IMPORT_ENTITIES.filter((e) => can(user.access, IMPORT_SPECS[e].permission)).map((e) => ({
    value: e,
    label: IMPORT_SPECS[e].label,
    note: IMPORT_SPECS[e].note,
  }));
  if (entities.length === 0) redirect("/admin/no-access");
  const jobs = await db.importJob.findMany({
    where: { organizationId: user.organizationId, entity: { in: entities.map((e) => e.value) } },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return (
    <>
      <PageHeader title="Imports" description="Bring existing records in from Excel. Every row is checked first; nothing is saved unless all rows are right." />
      <ImportPanel entities={entities} />
      {jobs.length > 0 && (
        <div className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent imports</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{formatDateTime(j.createdAt)}</TableCell>
                    <TableCell>{IMPORT_SPECS[j.entity as keyof typeof IMPORT_SPECS]?.label ?? j.entity}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.successRows}</TableCell>
                    <TableCell>{j.createdBy.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}
