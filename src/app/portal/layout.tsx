import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { getCompanyProfile, getDefaultOrganizationId } from "@/modules/settings/settings.service";
import { SignOutButton } from "./sign-out-button";

// Student portal: depends on the signed-in student, so nothing here is static.
export const instant = false;

async function Brand() {
  const orgId = await getDefaultOrganizationId();
  const company = orgId ? await getCompanyProfile(orgId) : null;
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {company?.logoUrl && <img src={company.logoUrl} alt="" className="size-8 object-contain" />}
      <span className="font-semibold">{company?.name ?? "Student portal"}</span>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          <Suspense fallback={<Skeleton className="h-6 w-40" />}>
            <Brand />
          </Suspense>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>{children}</Suspense>
      </main>
    </div>
  );
}
