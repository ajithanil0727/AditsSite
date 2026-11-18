import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { Placements } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("PLACEMENTS");

export default async function PlacementsPage() {
  const { page, data } = await loadSystemPage("PLACEMENTS");
  return (
    <PageView page={page} data={data} title="Placements" subtitle="Where our students work today.">
      <Placements data={data} />
    </PageView>
  );
}
