import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/modules/auth/current";
import { getCompanyProfile, getDefaultOrganizationId } from "@/modules/settings/settings.service";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-gradient-to-br from-lavender via-background to-mint p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <Suspense fallback={<Skeleton className="mx-auto h-6 w-40" />}>
            <CompanyName />
          </Suspense>
          <CardDescription>Sign in to the staff panel</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <LoginGate searchParams={props.searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function CompanyName() {
  const orgId = await getDefaultOrganizationId();
  const company = orgId ? await getCompanyProfile(orgId) : null;
  return <CardTitle className="text-xl">{company?.name ?? "Management"}</CardTitle>;
}

async function LoginGate({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/admin") ? params.next : "/admin";
  if (await getCurrentUser()) redirect(next);
  return <LoginForm next={next} />;
}
