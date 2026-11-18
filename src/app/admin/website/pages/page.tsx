import type { Metadata } from "next";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { BUILT_IN_BLOCK } from "@/modules/website/sections";
import { listPages } from "@/modules/website/website.queries";
import { NewPageDialog } from "./page-dialogs";

export const metadata: Metadata = { title: "Website pages" };

export default async function WebsitePagesPage() {
  const user = await requirePagePermission("website.view");
  const pages = await listPages(user.organizationId);
  return (
    <>
      <PageHeader
        title="Pages"
        description="Every page on the public website. Edit sections, preview the draft, then publish."
        actions={
          can(user.access, "website.edit") && (
            <NewPageDialog
              trigger={
                <Button>
                  <PlusIcon /> New page
                </Button>
              }
            />
          )
        }
      />
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead className="hidden md:table-cell">Built-in part</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Last published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/website/pages/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{p.path}</div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {p.kind === "CUSTOM" ? "Custom page" : (BUILT_IN_BLOCK[p.kind] ?? "—")}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.kind === "CUSTOM" && p.status !== "PUBLISHED" ? (
                      <StatusBadge tone="neutral">Not on the site</StatusBadge>
                    ) : (
                      <StatusBadge tone="mint">Live</StatusBadge>
                    )}
                    {p.hasDraftChanges && <StatusBadge tone="peach">Unpublished changes</StatusBadge>}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {p.publishedAt ? formatDateTime(p.publishedAt) : "—"}
                </TableCell>
                <TableCell>
                  {(p.kind !== "CUSTOM" || p.status === "PUBLISHED") && (
                    <Button asChild variant="ghost" size="icon-sm" aria-label="Open on the website">
                      <a href={p.path} target="_blank" rel="noopener noreferrer">
                        <ExternalLinkIcon />
                      </a>
                    </Button>
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
