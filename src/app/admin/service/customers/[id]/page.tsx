import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge, toTone } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { getCustomer } from "@/modules/service/jobs.queries";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage(props: PageProps<"/admin/service/customers/[id]">) {
  const user = await requirePagePermission("jobcards.view");
  const { id } = await props.params;
  const c = await getCustomer(user, id);
  if (!c) notFound();
  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.phone, c.altPhone, c.email, c.gstin && `GSTIN ${c.gstin}`].filter(Boolean).join(" · ")}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {c.devices.map((d) => (
                <li key={d.id} className="py-2">
                  <div className="font-medium">
                    {[d.deviceType.name, d.brand?.name, d.model?.name ?? d.modelText].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[d.imei && `IMEI ${d.imei}`, d.serialNo && `S/N ${d.serialNo}`].filter(Boolean).join(" · ") || "—"}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Job cards</CardTitle>
          </CardHeader>
          <CardContent>
            {c.jobCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No job cards you can see.</p>
            ) : (
              <ul className="divide-y text-sm">
                {c.jobCards.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Link href={`/admin/service/jobs/${j.id}`} className="font-mono font-medium hover:underline">
                        {j.jobNo}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatDate(j.receivedAt)} · {j.problemReported.slice(0, 60)}
                      </span>
                    </span>
                    <StatusBadge tone={toTone(j.status.color)}>{j.status.name}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
