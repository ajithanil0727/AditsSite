import type { PermissionKey } from "@/lib/permissions";
import { canAny, type Access } from "@/modules/rbac/access";

/** Icon names are mapped to components in the (client) sidebar. */
export type NavIcon =
  | "dashboard"
  | "building"
  | "branch"
  | "receipt"
  | "hash"
  | "users"
  | "shield"
  | "history"
  | "wrench"
  | "intake"
  | "customers"
  | "invoice"
  | "stock"
  | "parts"
  | "movements"
  | "transfer"
  | "requests"
  | "purchase"
  | "database";

export type NavItem = {
  title: string;
  href: string;
  icon: NavIcon;
  /** Visible if the user has ANY of these. */
  permissions: PermissionKey[];
  /** Highlight only on an exact path match (for items that are prefixes of others). */
  exact?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

const MASTER_PERMISSIONS: PermissionKey[] = [
  "masters.service",
  "masters.inventory",
  "masters.accounts",
  "vendors.manage",
  "accounts.manage_accounts",
];

/** Sidebar structure. New modules add their group here as they are built. */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/admin", icon: "dashboard", permissions: ["dashboard.view"] }],
  },
  {
    label: "Service",
    items: [
      { title: "New intake", href: "/admin/service/intake", icon: "intake", permissions: ["jobcards.create"] },
      { title: "Job cards", href: "/admin/service/jobs", icon: "wrench", permissions: ["jobcards.view"] },
      { title: "Customers", href: "/admin/service/customers", icon: "customers", permissions: ["jobcards.view"] },
      { title: "Invoices", href: "/admin/invoices", icon: "invoice", permissions: ["invoices.view"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { title: "Stock", href: "/admin/inventory/stock", icon: "stock", permissions: ["inventory.view"] },
      {
        title: "Parts",
        href: "/admin/inventory/parts",
        icon: "parts",
        permissions: ["inventory.view", "parts.manage"],
      },
      {
        title: "Part requests",
        href: "/admin/inventory/requests",
        icon: "requests",
        permissions: ["part_requests.issue"],
      },
      { title: "Transfers", href: "/admin/inventory/transfers", icon: "transfer", permissions: ["inventory.view"] },
      { title: "Movements", href: "/admin/inventory/movements", icon: "movements", permissions: ["inventory.view"] },
      { title: "Purchases", href: "/admin/purchases", icon: "purchase", permissions: ["purchases.view"] },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Company", href: "/admin/settings/company", icon: "building", permissions: ["settings.view"] },
      { title: "GST registrations", href: "/admin/settings/gst", icon: "receipt", permissions: ["settings.view"] },
      { title: "Branches", href: "/admin/settings/branches", icon: "branch", permissions: ["branches.view"] },
      { title: "Number series", href: "/admin/settings/number-series", icon: "hash", permissions: ["settings.view"] },
      { title: "Master data", href: "/admin/settings/masters", icon: "database", permissions: MASTER_PERMISSIONS },
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
  masters: "Master data",
  service: "Service",
  intake: "New intake",
  jobs: "Job cards",
  customers: "Customers",
  invoices: "Invoices",
  inventory: "Inventory",
  stock: "Stock",
  parts: "Parts",
  requests: "Part requests",
  transfers: "Transfers",
  movements: "Movements",
  purchases: "Purchases",
  print: "Print",
  new: "New",
  "no-access": "No access",
  deviceType: "Device types",
  brand: "Brands",
  deviceModel: "Device models",
  problemCategory: "Problem categories",
  jobStatus: "Job card statuses",
  warrantyRule: "Warranty rules",
  serviceRate: "Labour charges",
  partCategory: "Part categories",
  unit: "Units",
  vendor: "Vendors",
  paymentMode: "Payment modes",
  taxRate: "GST rates",
  hsnSac: "HSN / SAC codes",
  moneyAccount: "Cash & bank accounts",
};

/** Path segments with no page of their own (breadcrumbs render them as text). */
export const NON_LINK_SEGMENTS = new Set(["/admin/settings", "/admin/service", "/admin/inventory"]);
