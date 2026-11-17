import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import type { ActionContext } from "@/modules/rbac/action";
import type { CompanyProfile } from "./settings.schemas";

export const COMPANY_KEY = "company";
const companyTag = (orgId: string) => `settings:${orgId}:company`;

export type CompanyProfileView = CompanyProfile & { logoUrl: string | null };

const FALLBACK: CompanyProfileView = {
  name: "Our Institute",
  legalName: undefined,
  tagline: undefined,
  email: undefined,
  website: undefined,
  addressLine2: undefined,
  phone: "",
  addressLine1: "",
  city: "",
  state: "",
  pincode: "",
  logoUrl: null,
};

/** Company profile, cached on the server and refreshed when it is saved. */
export async function getCompanyProfile(organizationId: string): Promise<CompanyProfileView> {
  "use cache";
  cacheTag(companyTag(organizationId));
  cacheLife("hours");
  const row = await db.setting.findUnique({
    where: { organizationId_key: { organizationId, key: COMPANY_KEY } },
  });
  if (!row) return FALLBACK;
  const profile = row.value as CompanyProfile;
  return { ...profile, logoUrl: profile.logoFileId ? `/api/files/${profile.logoFileId}` : null };
}

/** The single organisation (Phase 1 is single-tenant). */
export async function getDefaultOrganizationId(): Promise<string | null> {
  "use cache";
  cacheTag("organization");
  const org = await db.organization.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  return org?.id ?? null;
}

export async function updateCompanyProfile(ctx: ActionContext, input: CompanyProfile) {
  const orgId = ctx.user.organizationId;
  await db.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: COMPANY_KEY } },
    });
    const value = { ...input, logoFileId: input.logoFileId ?? null } as Prisma.InputJsonValue;
    await tx.setting.upsert({
      where: { organizationId_key: { organizationId: orgId, key: COMPANY_KEY } },
      create: { organizationId: orgId, key: COMPANY_KEY, value },
      update: { value },
    });
    await tx.organization.update({
      where: { id: orgId },
      data: { name: input.name, legalName: input.legalName ?? null },
    });
    await writeAudit(tx, ctx.actor, {
      action: existing ? "UPDATE" : "CREATE",
      entityType: "Setting",
      entityId: COMPANY_KEY,
      before: existing?.value,
      after: value,
    });
  });
  updateTag(companyTag(orgId));
}
