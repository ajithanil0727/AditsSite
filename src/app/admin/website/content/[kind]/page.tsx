import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { CONTENT, isContentKind } from "@/modules/website/content-registry";
import { contentRefOptions, listContent } from "@/modules/website/website.queries";
import { ContentTable } from "./content-table";

export async function generateMetadata(props: PageProps<"/admin/website/content/[kind]">): Promise<Metadata> {
  const { kind } = await props.params;
  return { title: isContentKind(kind) ? CONTENT[kind].label : "Website content" };
}

export default async function ContentKindPage(props: PageProps<"/admin/website/content/[kind]">) {
  const user = await requireUser();
  const { kind } = await props.params;
  if (!isContentKind(kind)) notFound();
  const def = CONTENT[kind];
  const canEdit = can(user.access, def.permission);
  if (!canEdit && !can(user.access, "website.view")) redirect("/admin/no-access");
  const q = String((await props.searchParams).q ?? "").slice(0, 100);
  const [rows, refOptions] = await Promise.all([
    listContent(user.organizationId, def, q),
    contentRefOptions(user.organizationId, def),
  ]);
  return (
    <>
      <PageHeader title={def.label} description={def.description} />
      <ContentTable kind={kind} rows={rows} refOptions={refOptions} canEdit={canEdit} />
    </>
  );
}
