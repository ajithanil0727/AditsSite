import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { ServiceGrid } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("SERVICES");

export default async function ServicesPage() {
  const { page, data } = await loadSystemPage("SERVICES");
  return (
    <PageView
      page={page}
      data={data}
      title="Repair services"
      subtitle="Board-level repairs for phones, laptops and more."
    >
      <ServiceGrid services={data.services} />
    </PageView>
  );
}
