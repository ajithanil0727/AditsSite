import { Suspense } from "react";
import { loadSystemPage, PageView, systemPageMetadata } from "@/components/site/page-view";
import { Placements } from "@/components/site/sections";
import { Container } from "@/components/site/site-ui";
import { getPlacementFigures } from "@/modules/website/site.data";

export const generateMetadata = () => systemPageMetadata("PLACEMENTS");

async function Figures() {
  const f = await getPlacementFigures();
  if (!f) return null;
  const tiles = [
    ...(f.percent !== null ? [[`${Math.round(f.percent)}%`, "placement rate"]] : []),
    [String(f.placed), "students placed"],
    [String(f.hiring), "hiring companies"],
  ];
  return (
    <section className="pt-12">
      <Container>
        <dl className="grid gap-4 sm:grid-cols-3">
          {tiles.map(([value, label]) => (
            <div key={label} className="rounded-2xl bg-mint p-6 text-center text-mint-foreground">
              <dt className="sr-only">{label}</dt>
              <dd className="text-4xl font-bold tabular-nums">{value}</dd>
              <dd className="mt-1 text-sm">{label}</dd>
            </div>
          ))}
        </dl>
        {f.percent !== null && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Placement rate: students placed out of those who completed a course and asked for placement assistance.
          </p>
        )}
      </Container>
    </section>
  );
}

export default async function PlacementsPage() {
  const { page, data } = await loadSystemPage("PLACEMENTS");
  return (
    <PageView page={page} data={data} title="Placements" subtitle="Where our students work today.">
      <Suspense fallback={null}>
        <Figures />
      </Suspense>
      <Placements data={data} />
    </PageView>
  );
}
