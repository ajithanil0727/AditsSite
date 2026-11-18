import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { Testimonials } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("TESTIMONIALS");

export default async function TestimonialsPage() {
  const { page, data } = await loadSystemPage("TESTIMONIALS");
  return (
    <PageView page={page} data={data} title="Testimonials">
      <Testimonials data={data} />
    </PageView>
  );
}
