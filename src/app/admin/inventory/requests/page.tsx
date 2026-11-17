import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { branchConstraint } from "@/modules/rbac/access";
import { RequestActions } from "./request-actions";

export const metadata: Metadata = { title: "Part requests" };

export default async function PartRequestsPage() {
  const user = await requirePagePermission("part_requests.issue");
  const scope = branchConstraint(user.access, "part_requests.issue", await getActiveBranchId(user));
  const requests = await db.partRequest.findMany({
    where: {
      status: "PENDING",
      jobCard: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
      },
    },
    include: {
      part: {
        select: {
          name: true,
          sku: true,
          defaultSalePrice: true,
          unit: { select: { symbol: true } },
          stocks: { select: { branchId: true, qty: true } },
        },
      },
      jobCard: { select: { id: true, jobNo: true, branchId: true, branch: { select: { code: true } } } },
      requestedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Part requests"
        description="Parts engineers have asked for. Issuing deducts stock and adds the part to the job."
      />
      <Card className="max-w-5xl">
        <CardContent>
          {requests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => {
                const onHand = Number(r.part.stocks.find((s) => s.branchId === r.jobCard.branchId)?.qty ?? 0);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {r.part.name} × {Number(r.qty)} {r.part.unit.symbol}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <Link href={`/admin/service/jobs/${r.jobCard.id}`} className="font-mono hover:underline">
                          {r.jobCard.jobNo}
                        </Link>{" "}
                        · {r.requestedBy.name} · {formatDateTime(r.createdAt)}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                      <div
                        className={
                          onHand >= Number(r.qty) ? "text-xs text-muted-foreground" : "text-xs text-destructive"
                        }
                      >
                        {onHand} on hand at {r.jobCard.branch.code}
                      </div>
                    </div>
                    <RequestActions
                      jobId={r.jobCard.id}
                      requestId={r.id}
                      partId={r.partId}
                      qty={Number(r.qty)}
                      price={r.part.defaultSalePrice != null ? Number(r.part.defaultSalePrice) : null}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
