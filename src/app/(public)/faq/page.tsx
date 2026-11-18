import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { FaqList } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("FAQ");

export default async function FaqPage() {
  const { page, data } = await loadSystemPage("FAQ");
  const categories = [...new Set(data.faqs.map((f) => f.category ?? ""))];
  return (
    <PageView page={page} data={data} title="Frequently asked questions">
      {categories.length > 1 ? (
        categories.map((c) => (
          <FaqList
            key={c || "general"}
            title={c || "General"}
            faqs={data.faqs.filter((f) => (f.category ?? "") === c)}
          />
        ))
      ) : (
        <FaqList faqs={data.faqs} />
      )}
    </PageView>
  );
}
