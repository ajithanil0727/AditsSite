import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { Branches } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("BRANCHES");

export default async function BranchesPage() {
  const { page, data } = await loadSystemPage("BRANCHES");
  return (
    <PageView page={page} data={data} title="Our branches">
      <Branches data={data} />
    </PageView>
  );
}
