import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/modules/auth/current";
import { listMaster, refOptions } from "@/modules/masters/masters.service";
import { MASTERS, isMasterKind } from "@/modules/masters/registry";
import { MasterTable } from "./master-table";

export const metadata: Metadata = { title: "Master data" };

export default async function MasterPage(props: PageProps<"/admin/settings/masters/[kind]">) {
  const { kind } = await props.params;
  if (!isMasterKind(kind)) notFound();
  const def = MASTERS[kind];
  const user = await requirePagePermission(def.permission);
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const [rows, options] = await Promise.all([listMaster(user, def, q), refOptions(user, def)]);

  return (
    <>
      <PageHeader title={def.label} description={def.description} />
      <MasterTable kind={kind} rows={rows} options={options} />
    </>
  );
}
