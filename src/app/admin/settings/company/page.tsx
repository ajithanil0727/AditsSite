import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/modules/auth/current";
import { can } from "@/modules/rbac/access";
import { getCompanyProfile } from "@/modules/settings/settings.service";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const user = await requirePagePermission("settings.view");
  const { logoUrl, ...profile } = await getCompanyProfile(user.organizationId);
  return (
    <>
      <PageHeader title="Company" description="Shown on invoices, receipts, certificates and the website." />
      <CompanyForm
        initial={{
          name: profile.name,
          legalName: profile.legalName ?? "",
          tagline: profile.tagline ?? "",
          phone: profile.phone,
          email: profile.email ?? "",
          website: profile.website ?? "",
          addressLine1: profile.addressLine1,
          addressLine2: profile.addressLine2 ?? "",
          city: profile.city,
          state: profile.state,
          pincode: profile.pincode,
          logoFileId: profile.logoFileId ?? null,
        }}
        logoUrl={logoUrl}
        canEdit={can(user.access, "settings.update")}
      />
    </>
  );
}
