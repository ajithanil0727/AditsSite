import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { listShelf } from "@/modules/service/jobs.queries";
import { ShelfTable } from "./shelf-table";

export const metadata: Metadata = { title: "Shelf" };

/** Jobs waiting for an engineer. Engineers take them for themselves; the service manager can also assign on the job card. */
export default async function ShelfPage(props: PageProps<"/admin/service/shelf">) {
  const user = await requirePagePermission("jobcards.self_assign");
  const sp = await props.searchParams;
  const returned = typeof sp.returned === "string" ? sp.returned.slice(0, 40) : null;
  const rows = await listShelf(user, await getActiveBranchId(user));
  return (
    <>
      <PageHeader
        title="Shelf"
        description="Devices waiting for an engineer, most urgent first. Take a job and it moves to My jobs; you can put it back from the job card if you can't do it."
      />
      {returned && (
        <p role="status" className="mb-4 rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground">
          Job {returned} is back on the shelf. The service manager and the other engineers have been told.
        </p>
      )}
      <ShelfTable rows={rows} canTake />
    </>
  );
}
