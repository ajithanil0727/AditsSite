import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/modules/auth/current";
import { getSiteSettingsForEditor } from "@/modules/website/website.queries";
import { SiteSettingsForm } from "./site-settings-form";

export const metadata: Metadata = { title: "Site settings" };

export default async function SiteSettingsPage() {
  const user = await requirePagePermission("website.edit");
  const settings = await getSiteSettingsForEditor(user.organizationId);
  return (
    <>
      <PageHeader
        title="Site settings"
        description="Contact details, WhatsApp button, social links, header button, footer and search engine defaults. The company name and logo come from Settings → Company."
      />
      <SiteSettingsForm initial={settings} />
    </>
  );
}
