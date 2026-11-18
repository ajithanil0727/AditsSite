import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { parseListParams } from "@/lib/list-params";
import { requirePagePermission } from "@/modules/auth/current";
import { listMedia } from "@/modules/website/website.queries";
import { MediaManager } from "./media-manager";

export const metadata: Metadata = { title: "Media library" };

export default async function MediaPage(props: PageProps<"/admin/website/media">) {
  const user = await requirePagePermission("media.manage");
  const params = parseListParams(await props.searchParams, { defaultPageSize: 50 });
  const { rows, total, folders } = await listMedia(user.organizationId, params);
  return (
    <>
      <PageHeader
        title="Media library"
        description="Website images. Upload, crop, and describe them (alt text) for accessibility and Google."
      />
      <MediaManager items={rows} total={total} page={params.page} pageSize={params.pageSize} folders={folders} />
    </>
  );
}
