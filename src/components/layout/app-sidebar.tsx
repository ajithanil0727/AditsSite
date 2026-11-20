"use client";

import {
  ArrowLeftRightIcon,
  BadgeCheckIcon,
  BookOpenIcon,
  CalendarClockIcon,
  GraduationCapIcon,
  ReceiptIndianRupeeIcon,
  UserPlusIcon,
  UsersRoundIcon,
  BoxesIcon,
  BuildingIcon,
  ClipboardListIcon,
  ContactIcon,
  DatabaseIcon,
  FileTextIcon,
  GitBranchIcon,
  HashIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PlusCircleIcon,
  ReceiptIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TruckIcon,
  UsersIcon,
  WrenchIcon,
  InboxIcon,
  PhoneCallIcon,
  ChartColumnIcon,
  PanelsTopLeftIcon,
  MenuIcon,
  ImagesIcon,
  LayersIcon,
  GlobeIcon,
  BookOpenTextIcon,
  WalletIcon,
  HandCoinsIcon,
  TrendingUpIcon,
  HandshakeIcon,
  PieChartIcon,
  IdCardIcon,
  CalendarCheckIcon,
  PlaneIcon,
  CalendarHeartIcon,
  BanknoteIcon,
  AwardIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
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
  wrench: WrenchIcon,
  intake: PlusCircleIcon,
  customers: ContactIcon,
  invoice: FileTextIcon,
  stock: PackageIcon,
  parts: BoxesIcon,
  movements: ScrollTextIcon,
  transfer: ArrowLeftRightIcon,
  requests: ClipboardListIcon,
  purchase: TruckIcon,
  database: DatabaseIcon,
  admission: UserPlusIcon,
  students: GraduationCapIcon,
  courses: BookOpenIcon,
  batches: UsersRoundIcon,
  dues: CalendarClockIcon,
  receipts: ReceiptIndianRupeeIcon,
  approvals: BadgeCheckIcon,
  leads: InboxIcon,
  followups: PhoneCallIcon,
  report: ChartColumnIcon,
  pages: PanelsTopLeftIcon,
  menu: MenuIcon,
  media: ImagesIcon,
  content: LayersIcon,
  globe: GlobeIcon,
  daybook: BookOpenTextIcon,
  expense: WalletIcon,
  income: HandCoinsIcon,
  pnl: TrendingUpIcon,
  partners: HandshakeIcon,
  distribution: PieChartIcon,
  employees: IdCardIcon,
  staffAttendance: CalendarCheckIcon,
  leave: PlaneIcon,
  holidays: CalendarHeartIcon,
  payroll: BanknoteIcon,
  incentives: AwardIcon,
  certificates: BadgeCheckIcon,
  drives: BriefcaseBusinessIcon,
  companies: Building2Icon,
  placementStats: ChartColumnIcon,
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
  const isActive = (href: string, exact?: boolean) =>
    href === "/admin"
      ? pathname === href
      : exact
        ? pathname === href || (pathname.startsWith(href + "/") && !pathname.endsWith("/new"))
        : pathname.startsWith(href);

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
                      <SidebarMenuButton asChild isActive={isActive(item.href, item.exact)} tooltip={item.title}>
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
