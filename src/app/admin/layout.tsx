import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BranchSwitcher } from "@/components/layout/branch-switcher";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { navFor } from "@/components/layout/nav-config";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveBranchId, getSelectableBranches, requireUser } from "@/modules/auth/current";
import { getCompanyProfile } from "@/modules/settings/settings.service";

// The admin shell depends on the signed-in user (session cookie, permissions, branches), so it can't be
// part of a static shell. Pages below still stream instantly via admin/loading.tsx.
export const instant = false;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [branches, activeBranchId, company] = await Promise.all([
    getSelectableBranches(user),
    getActiveBranchId(user),
    getCompanyProfile(user.organizationId),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar nav={navFor(user.access)} companyName={company.name} logoUrl={company.logoUrl} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <BranchSwitcher
              branches={branches}
              activeBranchId={activeBranchId}
              allLabel={user.access.canSeeAllBranches ? "All branches" : "All my branches"}
            />
            <NotificationBell />
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 border-r bg-sidebar p-4 md:block">
        <Skeleton className="mb-6 h-8 w-40" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-7 w-full" />
        ))}
      </div>
      <div className="flex-1">
        <div className="h-14 border-b" />
        <div className="p-6">
          <Skeleton className="h-8 w-60" />
        </div>
      </div>
    </div>
  );
}
