import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/modules/auth/current";
import { listMenu, listPages } from "@/modules/website/website.queries";
import { MenuEditor } from "./menu-editor";

export const metadata: Metadata = { title: "Menus" };

export default async function MenuPage() {
  const user = await requirePagePermission("website.edit");
  const [items, pages] = await Promise.all([listMenu(user.organizationId), listPages(user.organizationId)]);
  return (
    <>
      <PageHeader
        title="Menus"
        description="The links in the website header and footer. Changes go live straight away."
      />
      <MenuEditor items={items} pages={pages.map((p) => ({ value: p.id, label: `${p.title} (${p.path})` }))} />
    </>
  );
}
