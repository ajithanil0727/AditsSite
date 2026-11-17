import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { getCompanyProfile, getDefaultOrganizationId } from "@/modules/settings/settings.service";

// Placeholder until the public website is built in Phase 4.
export default async function HomePage() {
  const orgId = await getDefaultOrganizationId();
  const company = orgId ? await getCompanyProfile(orgId) : null;
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between p-4">
        <span className="font-semibold">{company?.name ?? "Management"}</span>
        <ThemeToggle />
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-br from-sky via-background to-peach p-6 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {company?.name ?? "Management"}
        </h1>
        <p className="max-w-xl text-muted-foreground">
          {company?.tagline ?? "Chip-level repair training and electronics service."} The public website is coming in a
          later phase.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/track">Track your repair</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Staff sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
