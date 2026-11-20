import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { placementStats } from "@/modules/placements/placements.queries";

export const metadata: Metadata = { title: "Placement stats" };

type Row = {
  key: string;
  label: string;
  sub?: string;
  completed: number;
  optedIn: number;
  placed: number;
  percent: number | null;
};

function StatTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{title.replace("By ", "").replace(/^\w/, (c) => c.toUpperCase())}</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">Want placement</TableHead>
              <TableHead className="text-right">Placed</TableHead>
              <TableHead className="pr-6 text-right">Placement %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No completed students yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="pl-6">
                  {r.label}
                  {r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                <TableCell className="text-right tabular-nums">{r.optedIn}</TableCell>
                <TableCell className="text-right tabular-nums">{r.placed}</TableCell>
                <TableCell className="pr-6 text-right font-medium tabular-nums">
                  {r.percent === null ? "—" : `${r.percent}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function PlacementStatsPage() {
  const user = await requirePagePermission("placements.view");
  const s = await placementStats(user, await getActiveBranchId(user));
  const tiles = [
    ["Placement %", s.overall.percent === null ? "—" : `${s.overall.percent}%`],
    ["Placed", String(s.overall.placed)],
    ["Want placement", String(s.overall.optedIn)],
    ["Completed the course", String(s.overall.completed)],
  ];
  return (
    <>
      <PageHeader
        title="Placement stats"
        description="Placement % = students placed ÷ students who completed the course and want placement help. Placed = took an offer (joined or joining). Students who opted out aren't counted."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <CardContent>
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-6">
        <StatTable title="By branch" rows={s.byBranch} />
        <StatTable title="By course" rows={s.byCourse} />
        <StatTable title="By batch" rows={s.byBatch} />
      </div>
    </>
  );
}
