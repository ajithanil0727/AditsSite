/**
 * Demo seed: realistic data for local development. Safe to re-run (upserts).
 *   npm run db:seed
 * Imports only pure modules (no "server-only" code).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { BranchKind, DocType, RoleScope } from "../../src/generated/prisma/enums";
import { financialYear } from "../../src/lib/fy";
import { ALL_PERMISSIONS } from "../../src/lib/permissions";
import { hashPassword } from "../../src/modules/auth/password";
import { DEFAULT_FORMATS } from "../../src/modules/numbering/format";
import { DEFAULT_ROLES } from "../../src/modules/rbac/default-roles";
import { seedPhase2 } from "./phase2";
import { seedPhase3 } from "./phase3";
import { ADITS_COMPANY, applyBrand } from "./brand";
import { seedPhase4 } from "./phase4";
import { seedPhase5 } from "./phase5";
import { seedPhase6 } from "./phase6";
import { seedPhase7 } from "./phase7";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 }) });
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

const COMPANY = ADITS_COMPANY;

const BRANCHES: {
  code: string;
  name: string;
  kind: BranchKind;
  registered: boolean;
  addressLine1: string;
  city: string;
  pincode: string;
  phone: string;
}[] = [
  // Real ADITS branches (setup questionnaire, 2026-11-20). Palakkad is the main office; no separate head office.
  {
    code: "PKD",
    name: "Palakkad",
    kind: "BOTH",
    registered: true,
    addressLine1: "2nd Floor, AR Complex, Opp. Priyadarshini Theatre",
    city: "Palakkad",
    pincode: "678001",
    phone: "7356504329",
  },
  {
    code: "MKM",
    name: "Mukkam",
    kind: "BOTH",
    registered: false, // no GSTIN given: non-GST invoices (see CLAUDE.md open points)
    addressLine1: "Near Bharat Petrol Pump, Karassery",
    city: "Mukkam",
    pincode: "673602",
    phone: "9567174329",
  },
];

const USERS: {
  email: string;
  name: string;
  phone: string;
  roles: { role: string; scope?: RoleScope }[];
  branches: string[];
}[] = [
  {
    email: "superadmin@demo.test",
    name: "Super Admin",
    phone: "9895000000",
    roles: [{ role: "Super Admin" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "arun@demo.test",
    name: "Arun Kumar",
    phone: "9895000001",
    roles: [{ role: "Owner / Partner" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "bindu@demo.test",
    name: "Bindu Menon",
    phone: "9895000002",
    roles: [{ role: "Owner / Partner" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "faisal@demo.test",
    name: "Faisal Rahman",
    phone: "9895000003",
    roles: [{ role: "Owner / Partner" }],
    branches: ["MKM"],
  },
  {
    email: "admin@demo.test",
    name: "System Admin",
    phone: "9895000004",
    roles: [{ role: "Admin" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "manager.pkd@demo.test",
    name: "Deepa Nair",
    phone: "9895000005",
    roles: [{ role: "Branch Manager" }],
    branches: ["PKD"],
  },
  {
    email: "manager.mkm@demo.test",
    name: "Rahul Pillai",
    phone: "9895000006",
    roles: [{ role: "Branch Manager" }],
    branches: ["MKM"],
  },
  {
    email: "accounts@demo.test",
    name: "Shalini Varghese",
    phone: "9895000007",
    roles: [{ role: "Accountant" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "hr@demo.test",
    name: "Meera Joseph",
    phone: "9895000008",
    roles: [{ role: "HR" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "frontdesk.pkd@demo.test",
    name: "Anjali Das",
    phone: "9895000009",
    roles: [{ role: "Counsellor / Front Office" }],
    branches: ["PKD"],
  },
  {
    email: "trainer.pkd@demo.test",
    name: "Vishnu Prasad",
    phone: "9895000010",
    roles: [{ role: "Trainer" }],
    branches: ["PKD"],
  },
  {
    email: "placement@demo.test",
    name: "Nisha Thomas",
    phone: "9895000011",
    roles: [{ role: "Placement Officer" }],
    branches: ["PKD", "MKM"],
  },
  {
    email: "service.pkd@demo.test",
    name: "Jithin George",
    phone: "9895000012",
    roles: [{ role: "Service Manager" }],
    branches: ["PKD"],
  },
  {
    email: "engineer.pkd@demo.test",
    name: "Akhil Raj",
    phone: "9895000013",
    roles: [{ role: "Service Engineer" }],
    branches: ["PKD"],
  },
  {
    email: "engineer.mkm@demo.test",
    name: "Shameer K",
    phone: "9895000014",
    roles: [{ role: "Service Engineer" }],
    branches: ["MKM"],
  },
  {
    email: "store.pkd@demo.test",
    name: "Sajan Mathew",
    phone: "9895000015",
    roles: [{ role: "Store Keeper" }],
    branches: ["PKD"],
  },
];

/**
 * Owner shares per branch (must total 100 per branch). DEMO owners: the real partners and shares
 * are still to come (setup questionnaire left them for later).
 */
const SHARES: Record<string, Record<string, number>> = {
  PKD: { "Arun Kumar": 50, "Bindu Menon": 50 },
  MKM: { "Arun Kumar": 40, "Bindu Menon": 30, "Faisal Rahman": 30 },
};
const COST_ALLOCATION: Record<string, number> = { PKD: 60, MKM: 40 };

async function main() {
  const fyStart = new Date(
    Date.UTC(new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1, 3, 1),
  );

  // --- Organisation + settings ---
  const org =
    (await db.organization.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await db.organization.create({ data: { name: COMPANY.name, legalName: COMPANY.legalName } }));
  await db.setting.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "company" } },
    create: { organizationId: org.id, key: "company", value: COMPANY },
    update: {},
  });

  // --- GST registration (Kerala) ---
  const gst = await db.gstRegistration.upsert({
    where: { gstin: "32ABPFA5868C1ZE" },
    create: {
      organizationId: org.id,
      gstin: "32ABPFA5868C1ZE",
      legalName: COMPANY.legalName,
      tradeName: COMPANY.name,
      stateCode: "32",
      stateName: "Kerala",
      address: `${COMPANY.addressLine1}, ${COMPANY.city} ${COMPANY.pincode}`,
    },
    update: {},
  });

  // --- Branches + number series ---
  const branchIds: Record<string, string> = {};
  for (const [i, b] of BRANCHES.entries()) {
    const branch = await db.branch.upsert({
      where: { organizationId_code: { organizationId: org.id, code: b.code } },
      create: {
        organizationId: org.id,
        code: b.code,
        name: b.name,
        kind: b.kind,
        gstRegistrationId: b.registered ? gst.id : null,
        stateCode: "32",
        addressLine1: b.addressLine1,
        city: b.city,
        pincode: b.pincode,
        phone: b.phone,
        showOnWebsite: b.kind !== "HEAD_OFFICE",
        sortOrder: i,
      },
      update: {},
    });
    branchIds[b.code] = branch.id;
    const fy = financialYear(new Date());
    for (const [docType, def] of Object.entries(DEFAULT_FORMATS) as [
      DocType,
      { format: string; padding: number; reset?: "NEVER" },
    ][]) {
      const key = def.reset === "NEVER" ? "ALL" : fy;
      await db.numberSeries.upsert({
        where: { branchId_docType_financialYear: { branchId: branch.id, docType, financialYear: key } },
        create: {
          organizationId: org.id,
          branchId: branch.id,
          docType,
          financialYear: key,
          format: def.format,
          padding: def.padding,
          ...(def.reset ? { resetPolicy: def.reset } : {}),
        },
        update: {},
      });
    }
  }

  // --- Permissions (sync catalogue) ---
  const knownKeys = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const firstRun = knownKeys.size === 0;
  for (const p of ALL_PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { module: p.module, action: p.action, description: p.description, sortOrder: p.sortOrder },
    });
  }
  const permIds = new Map(
    (await db.permission.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );

  // Permissions added to the catalogue since the last seed go to the default roles that should have them.
  // Existing grants and admin edits are never removed.
  if (!firstRun) {
    for (const r of DEFAULT_ROLES) {
      const role = await db.role.findUnique({
        where: { organizationId_name: { organizationId: org.id, name: r.name } },
      });
      if (!role) continue;
      const added = r.permissions.filter((k) => !knownKeys.has(k));
      for (const key of added) {
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permIds.get(key)! } },
          create: { roleId: role.id, permissionId: permIds.get(key)! },
          update: {},
        });
      }
    }
  }

  // One-off grants for permissions that existed before but were added to a default role later.
  // Each runs once per database (marker setting), so later admin edits are respected.
  const LATER_GRANTS: { key: string; role: string; permissions: string[] }[] = [
    { key: "seed.grants.phase5", role: "Counsellor / Front Office", permissions: ["expenses.view", "expenses.create"] },
  ];
  for (const g of LATER_GRANTS) {
    const done = await db.setting.findUnique({ where: { organizationId_key: { organizationId: org.id, key: g.key } } });
    const role = await db.role.findUnique({ where: { organizationId_name: { organizationId: org.id, name: g.role } } });
    if (done || !role) continue;
    for (const key of g.permissions) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permIds.get(key)! } },
        create: { roleId: role.id, permissionId: permIds.get(key)! },
        update: {},
      });
    }
    await db.setting.create({ data: { organizationId: org.id, key: g.key, value: { done: true } } });
  }

  // One-off removals when a default role loses a permission by decision (runs once per database).
  const LATER_REVOKES: { key: string; role: string; permissions: string[] }[] = [
    // Phase 7: certificates are issued / cancelled by owners and branch managers only.
    { key: "seed.revokes.phase7", role: "Admin", permissions: ["certificates.issue", "certificates.revoke"] },
  ];
  for (const g of LATER_REVOKES) {
    const done = await db.setting.findUnique({ where: { organizationId_key: { organizationId: org.id, key: g.key } } });
    const role = await db.role.findUnique({ where: { organizationId_name: { organizationId: org.id, name: g.role } } });
    if (done || !role) continue;
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { in: g.permissions.map((k) => permIds.get(k)!).filter(Boolean) } },
    });
    await db.setting.create({ data: { organizationId: org.id, key: g.key, value: { done: true } } });
  }

  // --- Roles (create if missing; never overwrite admin edits) ---
  const roleIds: Record<string, { id: string; scope: RoleScope }> = {};
  for (const r of DEFAULT_ROLES) {
    let role = await db.role.findUnique({ where: { organizationId_name: { organizationId: org.id, name: r.name } } });
    if (!role) {
      role = await db.role.create({
        data: {
          organizationId: org.id,
          name: r.name,
          description: r.description,
          isSystem: true,
          discountLimitPercent: r.discountLimitPercent,
          discountLimitAmount: r.discountLimitAmount,
          isProtected: r.isProtected ?? false,
          permissions: { create: r.permissions.map((key) => ({ permissionId: permIds.get(key)! })) },
        },
      });
    } else if (role.isProtected !== (r.isProtected ?? false)) {
      // Which default roles are protected is structural, not an admin preference.
      role = await db.role.update({ where: { id: role.id }, data: { isProtected: r.isProtected ?? false } });
    }
    roleIds[r.name] = { id: role.id, scope: r.defaultScope };
  }

  // --- Users ---
  const passwordHash = await hashPassword(PASSWORD);
  for (const u of USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      create: { organizationId: org.id, email: u.email, name: u.name, phone: u.phone, emailVerified: true },
      update: {},
    });
    const hasCredential = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
    if (!hasCredential) {
      await db.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
      });
    }
    for (const r of u.roles) {
      const role = roleIds[r.role];
      await db.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id, scope: r.scope ?? role.scope },
        update: {},
      });
    }
    for (const code of u.branches) {
      await db.userBranch.upsert({
        where: { userId_branchId: { userId: user.id, branchId: branchIds[code] } },
        create: { userId: user.id, branchId: branchIds[code] },
        update: {},
      });
    }
  }

  // --- Partners (co-owners), per-branch shares, head-office cost allocation ---
  const owners = USERS.filter((u) => u.roles.some((r) => r.role === "Owner / Partner"));
  const partnerIds: Record<string, string> = {};
  for (const o of owners) {
    const user = await db.user.findUniqueOrThrow({ where: { email: o.email } });
    const partner = await db.partner.upsert({
      where: { userId: user.id },
      create: { organizationId: org.id, name: o.name, phone: o.phone, email: o.email, userId: user.id },
      update: {},
    });
    partnerIds[o.name] = partner.id;
  }
  if ((await db.partnerShare.count()) === 0) {
    for (const [code, shares] of Object.entries(SHARES)) {
      for (const [name, percent] of Object.entries(shares)) {
        await db.partnerShare.create({
          data: { partnerId: partnerIds[name], branchId: branchIds[code], percent, effectiveFrom: fyStart },
        });
      }
    }
  }
  if ((await db.costAllocation.count()) === 0) {
    for (const [code, percent] of Object.entries(COST_ALLOCATION)) {
      await db.costAllocation.create({
        data: { organizationId: org.id, branchId: branchIds[code], percent, effectiveFrom: fyStart },
      });
    }
  }

  // --- Phase 2: service + inventory ---
  const userIds = Object.fromEntries(
    (await db.user.findMany({ where: { organizationId: org.id }, select: { id: true, email: true } })).map((u) => [
      u.email,
      u.id,
    ]),
  );
  await seedPhase2(db, { orgId: org.id, branchIds, userIds });
  await seedPhase3(db, { orgId: org.id, branchIds, userIds });
  await seedPhase4(db, { orgId: org.id, branchIds, userIds });
  await seedPhase5(db, { orgId: org.id, branchIds, userIds });
  await seedPhase6(db, { orgId: org.id, branchIds, userIds });
  await seedPhase7(db, { orgId: org.id, userIds });
  await applyBrand(db, { orgId: org.id, branchIds, userIds });

  console.log(`Seeded: ${BRANCHES.length} branches, ${DEFAULT_ROLES.length} roles, ${USERS.length} users.`);
  console.log(`Sign in with e.g. arun@demo.test / ${PASSWORD} (owner) or engineer.pkd@demo.test (engineer).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
