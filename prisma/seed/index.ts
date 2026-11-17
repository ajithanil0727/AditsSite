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

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Demo@12345";

const COMPANY = {
  name: "ChipSkill Institute & Service",
  legalName: "ChipSkill Technologies LLP",
  tagline: "Learn chip-level repair. Get devices fixed right.",
  phone: "9847012345",
  email: "hello@chipskill.example",
  website: "https://chipskill.example",
  addressLine1: "2nd Floor, Lulu Square, MG Road",
  addressLine2: "Ravipuram",
  city: "Kochi",
  state: "Kerala",
  pincode: "682016",
  logoFileId: null,
};

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
  {
    code: "HO",
    name: "Head Office",
    kind: "HEAD_OFFICE",
    registered: true,
    addressLine1: "2nd Floor, Lulu Square, MG Road",
    city: "Kochi",
    pincode: "682016",
    phone: "9847012345",
  },
  {
    code: "KOC",
    name: "Kochi",
    kind: "BOTH",
    registered: true,
    addressLine1: "Near Edappally Toll, NH 66",
    city: "Kochi",
    pincode: "682024",
    phone: "9847012346",
  },
  {
    code: "TVM",
    name: "Thiruvananthapuram",
    kind: "BOTH",
    registered: true,
    addressLine1: "Statue Junction, MG Road",
    city: "Thiruvananthapuram",
    pincode: "695001",
    phone: "9847012347",
  },
  {
    code: "CLT",
    name: "Kozhikode",
    kind: "SERVICE",
    registered: false,
    addressLine1: "Mavoor Road, near KSRTC stand",
    city: "Kozhikode",
    pincode: "673004",
    phone: "9847012348",
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
    email: "arun@demo.test",
    name: "Arun Kumar",
    phone: "9895000001",
    roles: [{ role: "Owner / Partner" }],
    branches: ["HO", "KOC", "TVM", "CLT"],
  },
  {
    email: "bindu@demo.test",
    name: "Bindu Menon",
    phone: "9895000002",
    roles: [{ role: "Owner / Partner" }],
    branches: ["HO", "KOC", "TVM"],
  },
  {
    email: "faisal@demo.test",
    name: "Faisal Rahman",
    phone: "9895000003",
    roles: [{ role: "Owner / Partner" }],
    branches: ["HO", "TVM", "CLT"],
  },
  {
    email: "admin@demo.test",
    name: "System Admin",
    phone: "9895000004",
    roles: [{ role: "Admin" }],
    branches: ["HO", "KOC", "TVM", "CLT"],
  },
  {
    email: "manager.koc@demo.test",
    name: "Deepa Nair",
    phone: "9895000005",
    roles: [{ role: "Branch Manager" }],
    branches: ["KOC"],
  },
  {
    email: "manager.tvm@demo.test",
    name: "Rahul Pillai",
    phone: "9895000006",
    roles: [{ role: "Branch Manager" }],
    branches: ["TVM"],
  },
  {
    email: "accounts@demo.test",
    name: "Shalini Varghese",
    phone: "9895000007",
    roles: [{ role: "Accountant" }],
    branches: ["HO", "KOC", "TVM", "CLT"],
  },
  {
    email: "hr@demo.test",
    name: "Meera Joseph",
    phone: "9895000008",
    roles: [{ role: "HR" }],
    branches: ["HO", "KOC", "TVM", "CLT"],
  },
  {
    email: "frontdesk.koc@demo.test",
    name: "Anjali Das",
    phone: "9895000009",
    roles: [{ role: "Counsellor / Front Office" }],
    branches: ["KOC"],
  },
  {
    email: "trainer.koc@demo.test",
    name: "Vishnu Prasad",
    phone: "9895000010",
    roles: [{ role: "Trainer" }],
    branches: ["KOC"],
  },
  {
    email: "placement@demo.test",
    name: "Nisha Thomas",
    phone: "9895000011",
    roles: [{ role: "Placement Officer" }],
    branches: ["KOC", "TVM"],
  },
  {
    email: "service.koc@demo.test",
    name: "Jithin George",
    phone: "9895000012",
    roles: [{ role: "Service Manager" }],
    branches: ["KOC"],
  },
  {
    email: "engineer.koc@demo.test",
    name: "Akhil Raj",
    phone: "9895000013",
    roles: [{ role: "Service Engineer" }],
    branches: ["KOC"],
  },
  {
    email: "engineer.clt@demo.test",
    name: "Shameer K",
    phone: "9895000014",
    roles: [{ role: "Service Engineer" }],
    branches: ["CLT"],
  },
  {
    email: "store.koc@demo.test",
    name: "Sajan Mathew",
    phone: "9895000015",
    roles: [{ role: "Store Keeper" }],
    branches: ["KOC"],
  },
];

/** Owner shares per branch (must total 100 per branch). Head office has none: its costs are allocated. */
const SHARES: Record<string, Record<string, number>> = {
  KOC: { "Arun Kumar": 50, "Bindu Menon": 50 },
  TVM: { "Arun Kumar": 40, "Bindu Menon": 30, "Faisal Rahman": 30 },
  CLT: { "Arun Kumar": 35, "Faisal Rahman": 65 },
};
const COST_ALLOCATION: Record<string, number> = { KOC: 45, TVM: 35, CLT: 20 };

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
    where: { gstin: "32AAKFC1234M1ZP" },
    create: {
      organizationId: org.id,
      gstin: "32AAKFC1234M1ZP",
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
    for (const [docType, def] of Object.entries(DEFAULT_FORMATS) as [DocType, { format: string; padding: number }][]) {
      await db.numberSeries.upsert({
        where: { branchId_docType_financialYear: { branchId: branch.id, docType, financialYear: fy } },
        create: {
          organizationId: org.id,
          branchId: branch.id,
          docType,
          financialYear: fy,
          format: def.format,
          padding: def.padding,
        },
        update: {},
      });
    }
  }

  // --- Permissions (sync catalogue) ---
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
          permissions: { create: r.permissions.map((key) => ({ permissionId: permIds.get(key)! })) },
        },
      });
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

  console.log(`Seeded: ${BRANCHES.length} branches, ${DEFAULT_ROLES.length} roles, ${USERS.length} users.`);
  console.log(`Sign in with e.g. arun@demo.test / ${PASSWORD} (owner) or engineer.koc@demo.test (engineer).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
