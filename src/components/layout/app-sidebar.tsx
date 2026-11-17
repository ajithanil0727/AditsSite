"use client";

import {
  BuildingIcon,
  GitBranchIcon,
  HashIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NavGroup, NavIcon } from "./nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  building: BuildingIcon,
  branch: GitBranchIcon,
  receipt: ReceiptIcon,
  hash: HashIcon,
  users: UsersIcon,
  shield: ShieldCheckIcon,
  history: HistoryIcon,
};

export function AppSidebar({
  nav,
  companyName,
  logoUrl,
}: {
  nav: NavGroup[];
  companyName: string;
  logoUrl: string | null;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <span className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
                  {logoUrl ? (
                    <Image src={logoUrl} alt="" width={32} height={32} className="size-8 object-cover" unoptimized />
                  ) : (
                    <span className="text-sm font-bold">{companyName.slice(0, 1)}</span>
                  )}
                </span>
                <span className="truncate font-semibold">{companyName}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {nav.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                        <Link href={item.href} onClick={() => setOpenMobile(false)}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
