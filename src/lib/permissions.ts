/**
 * Permission catalogue: the single source of truth.
 * Format: `module.action`. The seed script syncs this list into the Permission table.
 * Add new permissions here; never check roles by name in code.
 */
export const PERMISSION_MODULES = {
  dashboard: { label: "Dashboard", actions: { view: "View dashboard" } },
  branches: {
    label: "Branches",
    actions: { view: "View", create: "Create", update: "Edit", delete: "Delete / restore" },
  },
  users: {
    label: "Users",
    actions: {
      view: "View",
      create: "Create",
      update: "Edit",
      delete: "Delete / restore",
      reset_password: "Reset password",
    },
  },
  roles: { label: "Roles & permissions", actions: { view: "View", manage: "Create / edit / delete" } },
  audit: { label: "Audit log", actions: { view: "View" } },
  settings: { label: "Settings", actions: { view: "View", update: "Edit" } },
  masters: {
    label: "Master data",
    actions: {
      general: "General",
      crm: "CRM",
      students: "Students",
      service: "Service",
      inventory: "Inventory",
      accounts: "Accounts",
      hr: "HR",
    },
  },
  leads: {
    label: "Enquiries",
    actions: {
      view: "View",
      create: "Create",
      update: "Edit",
      delete: "Delete",
      assign: "Assign",
      convert: "Convert",
      export: "Export",
    },
  },
  courses: { label: "Courses", actions: { view: "View", manage: "Manage" } },
  batches: {
    label: "Batches",
    actions: { view: "View", create: "Create", update: "Edit", delete: "Delete" },
  },
  students: {
    label: "Students",
    actions: {
      view: "View",
      create: "Admit",
      update: "Edit",
      delete: "Delete",
      transfer: "Transfer",
      import: "Import",
      export: "Export",
    },
  },
  student_attendance: { label: "Student attendance", actions: { view: "View", mark: "Mark" } },
  assessments: {
    label: "Assessments",
    actions: { view: "View", manage: "Manage", enter_marks: "Enter marks" },
  },
  certificates: { label: "Certificates", actions: { view: "View", issue: "Issue", revoke: "Revoke" } },
  fees: {
    label: "Fees",
    actions: {
      view: "View",
      collect: "Collect",
      cancel_receipt: "Cancel receipt",
      discount_request: "Request discount",
      discount_approve: "Approve discount",
      refund_request: "Request refund",
      refund_approve: "Approve refund",
      waive: "Waive instalment",
      export: "Export",
    },
  },
  jobcards: {
    label: "Job cards",
    actions: {
      view: "View",
      create: "Create (intake)",
      update: "Edit",
      assign: "Assign engineer",
      change_status: "Change status",
      qc: "QC",
      deliver: "Deliver",
      cancel: "Cancel",
      delete: "Delete",
      export: "Export",
    },
  },
  quotations: { label: "Quotations", actions: { create: "Create", record_decision: "Record customer decision" } },
  part_requests: { label: "Part requests", actions: { create: "Request", issue: "Issue" } },
  invoices: {
    label: "Invoices",
    actions: {
      view: "View",
      create: "Create",
      cancel: "Cancel",
      credit_note: "Credit note",
      collect_payment: "Collect payment",
      export: "Export",
    },
  },
  inventory: {
    label: "Inventory",
    actions: {
      view: "View",
      adjust: "Adjust stock",
      transfer: "Transfer",
      receive_transfer: "Receive transfer",
      export: "Export",
    },
  },
  parts: { label: "Parts", actions: { manage: "Manage", import: "Import" } },
  purchases: {
    label: "Purchases",
    actions: { view: "View", create: "Create", post: "Post", cancel: "Cancel" },
  },
  vendors: { label: "Vendors", actions: { view: "View", manage: "Manage", pay: "Pay" } },
  employees: {
    label: "Employees",
    actions: {
      view: "View",
      create: "Create",
      update: "Edit",
      delete: "Delete",
      view_sensitive: "View bank/PAN",
      import: "Import",
    },
  },
  hr_attendance: { label: "Staff attendance", actions: { view: "View", mark: "Mark" } },
  leaves: { label: "Leave", actions: { apply: "Apply", approve: "Approve" } },
  payroll: {
    label: "Payroll",
    actions: { view: "View", run: "Run", finalize: "Finalize", mark_paid: "Mark paid" },
  },
  incentives: { label: "Incentives", actions: { manage: "Manage", approve: "Approve" } },
  advances: { label: "Salary advances", actions: { manage: "Manage" } },
  accounts: {
    label: "Accounts",
    actions: { view_daybook: "View day book", manage_accounts: "Manage cash/bank accounts", contra: "Contra entry" },
  },
  income: { label: "Other income", actions: { view: "View", create: "Create" } },
  expenses: {
    label: "Expenses",
    actions: { view: "View", create: "Create", approve: "Approve", pay: "Pay" },
  },
  partners: { label: "Owners / partners", actions: { view: "View", manage: "Manage" } },
  profit: {
    label: "Profit distribution",
    actions: { view: "View", run: "Run", lock: "Lock", manage_allocation: "Manage cost allocation" },
  },
  companies: { label: "Hiring companies", actions: { view: "View", manage: "Manage" } },
  placements: {
    label: "Placements",
    actions: { view: "View", manage_drives: "Manage drives", manage_applications: "Manage applications" },
  },
  website: { label: "Website", actions: { view: "View", edit: "Edit", publish: "Publish" } },
  media: { label: "Media library", actions: { manage: "Manage" } },
  reports: { label: "Reports", actions: { view: "View", financial: "Financial reports", export: "Export" } },
} as const;

type Modules = typeof PERMISSION_MODULES;
export type PermissionModule = keyof Modules;
export type PermissionKey = {
  [M in PermissionModule]: `${M}.${Extract<keyof Modules[M]["actions"], string>}`;
}[PermissionModule];

export type PermissionDef = {
  key: PermissionKey;
  module: PermissionModule;
  action: string;
  description: string;
  sortOrder: number;
};

export const ALL_PERMISSIONS: PermissionDef[] = (() => {
  const list: PermissionDef[] = [];
  let order = 0;
  for (const [module, def] of Object.entries(PERMISSION_MODULES)) {
    for (const [action, description] of Object.entries(def.actions)) {
      list.push({
        key: `${module}.${action}` as PermissionKey,
        module: module as PermissionModule,
        action,
        description,
        sortOrder: order++,
      });
    }
  }
  return list;
})();

export const ALL_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSIONS.map((p) => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(value);
}

/** Expand "module.*" wildcards (used only by the default role definitions). */
export function expandPermissions(patterns: readonly string[]): PermissionKey[] {
  const out = new Set<PermissionKey>();
  for (const pattern of patterns) {
    if (pattern === "*") ALL_PERMISSION_KEYS.forEach((k) => out.add(k));
    else if (pattern.endsWith(".*")) {
      const mod = pattern.slice(0, -2);
      ALL_PERMISSION_KEYS.filter((k) => k.startsWith(`${mod}.`)).forEach((k) => out.add(k));
    } else if (isPermissionKey(pattern)) out.add(pattern);
    else throw new Error(`Unknown permission pattern: ${pattern}`);
  }
  return [...out];
}
