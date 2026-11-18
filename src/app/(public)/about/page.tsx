import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";

export const generateMetadata = () => systemPageMetadata("ABOUT");

export default async function AboutPage() {
  const { page, data } = await loadSystemPage("ABOUT");
  return <PageView page={page} data={data} title="About us" />;
}
