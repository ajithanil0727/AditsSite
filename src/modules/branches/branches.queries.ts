import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, branchWhere } from "@/modules/rbac/access";

export const BRANCH_SORTS = ["code", "name", "city", "kind"] as const;

export async function listBranches(user: CurrentUser, p: ListParams) {
  // Settings lists ignore the top-bar switcher: show every branch the user may manage.
  const scope = branchConstraint(user.access, "branches.view", null);
  const where: Prisma.BranchWhereInput = {
    organizationId: user.organizationId,
    deletedAt: p.showDeleted ? { not: null } : null,
    ...branchWhere(scope, "id"),
    ...(p.filters.kind ? { kind: p.filters.kind as Prisma.BranchWhereInput["kind"] } : {}),
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" } },
            { code: { contains: p.q, mode: "insensitive" } },
            { city: { contains: p.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.branch.findMany({
      where,
      include: { gstRegistration: { select: { gstin: true } } },
      orderBy: p.sort ? { [p.sort]: p.dir } : [{ sortOrder: "asc" }, { name: "asc" }],
      ...paging(p),
    }),
    db.branch.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      kind: b.kind,
      city: b.city,
      stateCode: b.stateCode,
      phone: b.phone,
      gstin: b.gstRegistration?.gstin ?? null,
      isActive: b.isActive,
      deleted: !!b.deletedAt,
      form: {
        id: b.id,
        code: b.code,
        name: b.name,
        kind: b.kind,
        gstRegistrationId: b.gstRegistrationId,
        stateCode: b.stateCode,
        addressLine1: b.addressLine1,
        addressLine2: b.addressLine2 ?? "",
        city: b.city,
        pincode: b.pincode,
        phone: b.phone,
        email: b.email ?? "",
        mapUrl: b.mapUrl ?? "",
        isActive: b.isActive,
        showOnWebsite: b.showOnWebsite,
        sortOrder: b.sortOrder,
      },
    })),
  };
}

export type BranchRow = Awaited<ReturnType<typeof listBranches>>["rows"][number];

export async function gstRegistrationOptions(organizationId: string) {
  const regs = await db.gstRegistration.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, gstin: true, stateCode: true, tradeName: true, legalName: true },
    orderBy: { gstin: "asc" },
  });
  return regs.map((r) => ({
    id: r.id,
    gstin: r.gstin,
    stateCode: r.stateCode,
    label: `${r.gstin} · ${r.tradeName ?? r.legalName}`,
  }));
}
