import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { Gallery } from "@/components/site/sections";

export const generateMetadata = () => systemPageMetadata("GALLERY");

export default async function GalleryPage() {
  const { page, data } = await loadSystemPage("GALLERY");
  const albums = [...new Set(data.gallery.map((g) => g.album ?? ""))];
  return (
    <PageView page={page} data={data} title="Gallery">
      {albums.length > 1 ? (
        albums.map((a) => (
          <Gallery
            key={a || "other"}
            title={a || "More photos"}
            items={data.gallery.filter((g) => (g.album ?? "") === a)}
          />
        ))
      ) : (
        <Gallery items={data.gallery} />
      )}
    </PageView>
  );
}
