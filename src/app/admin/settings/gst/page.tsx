import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { listGstRegistrations } from "@/modules/settings/gst.service";
import { GstFormDialog } from "./gst-form-dialog";

export const metadata: Metadata = { title: "GST registrations" };

export default async function GstPage() {
  const user = await requirePagePermission("settings.view");
  const rows = await listGstRegistrations(user.organizationId);
  const canEdit = can(user.access, "settings.update");

  return (
    <>
      <PageHeader
        title="GST registrations"
        description="One row per GSTIN. Link branches to a GSTIN on the Branches page; branches without one issue non-GST invoices."
        actions={
          canEdit && (
            <GstFormDialog
              trigger={
                <Button>
                  <PlusIcon /> Add GSTIN
                </Button>
              }
            />
          )
        }
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GSTIN</TableHead>
              <TableHead>Legal / trade name</TableHead>
              <TableHead className="hidden md:table-cell">State</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No GST registrations yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.gstin}</TableCell>
                <TableCell>
                  <div>{r.legalName}</div>
                  {r.tradeName && <div className="text-xs text-muted-foreground">{r.tradeName}</div>}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {r.stateName} ({r.stateCode})
                </TableCell>
                <TableCell>{r.branches.map((b) => b.code).join(", ") || "—"}</TableCell>
                <TableCell>
                  {r.isActive ? (
                    <Badge className="bg-mint text-mint-foreground">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {canEdit && (
                    <GstFormDialog
                      initial={{
                        id: r.id,
                        gstin: r.gstin,
                        legalName: r.legalName,
                        tradeName: r.tradeName ?? "",
                        stateName: r.stateName,
                        address: r.address,
                        isActive: r.isActive,
                      }}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
