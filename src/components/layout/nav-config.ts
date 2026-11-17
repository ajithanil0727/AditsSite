import type { PermissionKey } from "@/lib/permissions";
import { canAny, type Access } from "@/modules/rbac/access";

/** Icon names are mapped to components in the (client) sidebar. */
export type NavIcon = "dashboard" | "building" | "branch" | "receipt" | "hash" | "users" | "shield" | "history";

export type NavItem = {
  title: string;
  href: string;
  icon: NavIcon;
  /** Visible if the user has ANY of these. */
  permissions: PermissionKey[];
};

export type NavGroup = { label: string; items: NavItem[] };

/** Sidebar structure. New modules add their group here as they are built. */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/admin", icon: "dashboard", permissions: ["dashboard.view"] }],
  },
  {
    label: "Settings",
    items: [
      { title: "Company", href: "/admin/settings/company", icon: "building", permissions: ["settings.view"] },
      { title: "GST registrations", href: "/admin/settings/gst", icon: "receipt", permissions: ["settings.view"] },
      { title: "Branches", href: "/admin/settings/branches", icon: "branch", permissions: ["branches.view"] },
      { title: "Number series", href: "/admin/settings/number-series", icon: "hash", permissions: ["settings.view"] },
      { title: "Users", href: "/admin/settings/users", icon: "users", permissions: ["users.view"] },
      { title: "Roles & permissions", href: "/admin/settings/roles", icon: "shield", permissions: ["roles.view"] },
      { title: "Audit log", href: "/admin/settings/audit-log", icon: "history", permissions: ["audit.view"] },
    ],
  },
];

export function navFor(access: Access): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canAny(access, i.permissions)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Breadcrumb labels for path segments that aren't record ids. */
export const SEGMENT_LABELS: Record<string, string> = {
  admin: "Dashboard",
  settings: "Settings",
  company: "Company",
  gst: "GST registrations",
  branches: "Branches",
  "number-series": "Number series",
  users: "Users",
  roles: "Roles & permissions",
  "audit-log": "Audit log",
  new: "New",
  "no-access": "No access",
};
