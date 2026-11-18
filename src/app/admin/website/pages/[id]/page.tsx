import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { BUILT_IN_BLOCK } from "@/modules/website/sections";
import { getPageForEditor } from "@/modules/website/website.queries";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditWebsitePage(props: PageProps<"/admin/website/pages/[id]">) {
  const user = await requirePagePermission("website.view");
  const { id } = await props.params;
  const page = await getPageForEditor(user.organizationId, id);
  if (!page) notFound();
  return (
    <PageEditor
      page={page}
      builtIn={BUILT_IN_BLOCK[page.kind] ?? null}
      canEdit={can(user.access, "website.edit")}
      canPublish={can(user.access, "website.publish")}
    />
  );
}
