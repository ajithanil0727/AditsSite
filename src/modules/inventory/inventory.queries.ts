import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { StockMovementType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { paging, type ListParams } from "@/lib/list-params";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, branchWhere } from "@/modules/rbac/access";

const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

// ---------------------------------------------------------------- stock

export async function listStock(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "inventory.view", activeBranchId);
  const rows = await db.stock.findMany({
    where: {
      ...branchWhere(scope),
      part: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(p.filters.category ? { categoryId: p.filters.category } : {}),
        ...(p.filters.kind ? { kind: p.filters.kind as never } : {}),
        ...(p.q
          ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { sku: { contains: p.q, mode: "insensitive" } }] }
          : {}),
      },
    },
    include: {
      branch: { select: { code: true } },
      part: {
        select: {
          sku: true,
          name: true,
          kind: true,
          reorderLevel: true,
          unit: { select: { symbol: true } },
          category: { select: { name: true } },
        },
      },
    },
    orderBy: [{ part: { name: "asc" } }],
    take: 5000,
  });
  const mapped = rows.map((s) => {
    const reorder = n(s.reorderLevel) ?? n(s.part.reorderLevel) ?? 0;
    const qty = n(s.qty) ?? 0;
    return {
      id: s.id,
      branchId: s.branchId,
      partId: s.partId,
      branchCode: s.branch.code,
      sku: s.part.sku,
      name: s.part.name,
      kind: s.part.kind,
      category: s.part.category?.name ?? null,
      unit: s.part.unit.symbol,
      qty,
      avgCost: n(s.avgCost) ?? 0,
      value: Math.round(qty * (n(s.avgCost) ?? 0) * 100) / 100,
      reorderLevel: reorder,
      low: reorder > 0 && qty <= reorder,
    };
  });
  const filtered = p.filters.low === "1" ? mapped.filter((r) => r.low) : mapped;
  const totalValue = filtered.reduce((a, r) => a + r.value, 0);
  const start = (p.page - 1) * p.pageSize;
  return { total: filtered.length, totalValue, rows: filtered.slice(start, start + p.pageSize) };
}
export type StockRow = Awaited<ReturnType<typeof listStock>>["rows"][number];

// ---------------------------------------------------------------- parts

export async function listParts(user: CurrentUser, p: ListParams) {
  const where: Prisma.PartWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(p.filters.category ? { categoryId: p.filters.category } : {}),
    ...(p.filters.kind ? { kind: p.filters.kind as never } : {}),
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" } },
            { sku: { contains: p.q, mode: "insensitive" } },
            { compatibleModels: { contains: p.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const scope = branchConstraint(user.access, "inventory.view", null);
  const [rows, total] = await Promise.all([
    db.part.findMany({
      where,
      include: {
        unit: { select: { symbol: true } },
        category: { select: { name: true } },
        taxRate: { select: { rate: true } },
        hsnSac: { select: { code: true } },
        stocks: { where: branchWhere(scope), select: { qty: true } },
      },
      orderBy: p.sort ? { [p.sort]: p.dir } : { name: "asc" },
      ...paging(p),
    }),
    db.part.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      kind: r.kind,
      category: r.category?.name ?? null,
      unit: r.unit.symbol,
      salePrice: n(r.defaultSalePrice),
      taxRate: n(r.taxRate?.rate),
      hsn: r.hsnSac?.code ?? null,
      onHand: r.stocks.reduce((a, s) => a + Number(s.qty), 0),
      isActive: r.isActive,
      form: {
        id: r.id,
        sku: r.sku,
        name: r.name,
        kind: r.kind,
        categoryId: r.categoryId,
        unitId: r.unitId,
        hsnSacId: r.hsnSacId,
        taxRateId: r.taxRateId,
        defaultSalePrice: r.defaultSalePrice?.toString() ?? "",
        reorderLevel: r.reorderLevel.toString(),
        brandText: r.brandText ?? "",
        compatibleModels: r.compatibleModels ?? "",
        isActive: r.isActive,
      },
    })),
  };
}
export type PartRow = Awaited<ReturnType<typeof listParts>>["rows"][number];

/** Options for part forms (category, unit, HSN, GST). */
export async function partFormOptions(organizationId: string) {
  const [categories, units, hsn, rates] = await Promise.all([
    db.partCategory.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
    db.unit.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    db.hsnSac.findMany({ where: { organizationId, isActive: true, isService: false }, orderBy: { code: "asc" } }),
    db.taxRate.findMany({ where: { organizationId, isActive: true }, orderBy: { rate: "asc" } }),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    units: units.map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` })),
    hsn: hsn.map((h) => ({ value: h.id, label: `${h.code} · ${h.description}` })),
    rates: rates.map((r) => ({ value: r.id, label: r.name })),
  };
}

/** Parts for pickers, with on-hand qty in one branch when given. */
export async function partPickerOptions(organizationId: string, branchId?: string | null) {
  const parts = await db.part.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      defaultSalePrice: true,
      unit: { select: { symbol: true } },
      taxRate: { select: { rate: true } },
      stocks: branchId ? { where: { branchId }, select: { qty: true, avgCost: true } } : false,
    },
    orderBy: { name: "asc" },
  });
  return parts.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit.symbol,
    salePrice: n(p.defaultSalePrice),
    taxRate: n(p.taxRate?.rate) ?? 18,
    onHand: branchId && Array.isArray(p.stocks) && p.stocks[0] ? Number(p.stocks[0].qty) : null,
  }));
}
export type PartOption = Awaited<ReturnType<typeof partPickerOptions>>[number];

// ---------------------------------------------------------------- movements

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  OPENING: "Opening",
  PURCHASE: "Purchase",
  PURCHASE_RETURN: "Purchase return",
  JOB_ISSUE: "Issued to job",
  JOB_RETURN: "Returned from job",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  INTERNAL_USE: "Internal use",
};

export async function listMovements(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "inventory.view", activeBranchId);
  const where: Prisma.StockMovementWhereInput = {
    organizationId: user.organizationId,
    ...branchWhere(scope),
    ...(p.filters.type ? { type: p.filters.type as StockMovementType } : {}),
    ...(p.filters.part ? { partId: p.filters.part } : {}),
    ...(p.q
      ? {
          part: {
            OR: [{ name: { contains: p.q, mode: "insensitive" } }, { sku: { contains: p.q, mode: "insensitive" } }],
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: {
        part: { select: { sku: true, name: true, unit: { select: { symbol: true } } } },
        branch: { select: { code: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      ...paging(p),
    }),
    db.stockMovement.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((m) => ({
      id: m.id,
      at: m.createdAt.toISOString(),
      branchCode: m.branch.code,
      sku: m.part.sku,
      name: m.part.name,
      unit: m.part.unit.symbol,
      type: m.type,
      qty: Number(m.qty),
      unitCost: Number(m.unitCost),
      balanceAfter: Number(m.balanceAfter),
      note: m.note,
      refType: m.refType,
      refId: m.refId,
      userName: m.user?.name ?? null,
    })),
  };
}
export type MovementRow = Awaited<ReturnType<typeof listMovements>>["rows"][number];

// ---------------------------------------------------------------- transfers

export async function listTransfers(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "inventory.view", activeBranchId);
  const where: Prisma.StockTransferWhereInput = {
    organizationId: user.organizationId,
    ...(scope.branchIds
      ? { OR: [{ fromBranchId: { in: scope.branchIds } }, { toBranchId: { in: scope.branchIds } }] }
      : {}),
    ...(p.filters.status ? { status: p.filters.status as never } : {}),
    ...(p.q ? { transferNo: { contains: p.q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.stockTransfer.findMany({
      where,
      include: {
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      ...paging(p),
    }),
    db.stockTransfer.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((t) => ({
      id: t.id,
      transferNo: t.transferNo,
      from: t.fromBranch.name,
      to: t.toBranch.name,
      status: t.status,
      items: t._count.items,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
export type TransferRow = Awaited<ReturnType<typeof listTransfers>>["rows"][number];

export async function getTransfer(user: CurrentUser, id: string) {
  const t = await db.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      fromBranch: { select: { id: true, name: true } },
      toBranch: { select: { id: true, name: true } },
      dispatchedBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      items: { include: { part: { select: { sku: true, name: true, unit: { select: { symbol: true } } } } } },
    },
  });
  if (!t) return null;
  const scope = branchConstraint(user.access, "inventory.view", null);
  if (scope.branchIds && !scope.branchIds.includes(t.fromBranchId) && !scope.branchIds.includes(t.toBranchId))
    return null;
  return t;
}

// ---------------------------------------------------------------- purchases

export async function listPurchases(user: CurrentUser, p: ListParams, activeBranchId: string | null) {
  const scope = branchConstraint(user.access, "purchases.view", activeBranchId);
  const where: Prisma.PurchaseWhereInput = {
    organizationId: user.organizationId,
    ...branchWhere(scope),
    ...(p.filters.status ? { status: p.filters.status as never } : {}),
    ...(p.filters.vendor ? { vendorId: p.filters.vendor } : {}),
    ...(p.q
      ? {
          OR: [
            { purchaseNo: { contains: p.q, mode: "insensitive" } },
            { billNo: { contains: p.q, mode: "insensitive" } },
            { vendor: { name: { contains: p.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.purchase.findMany({
      where,
      include: { vendor: { select: { name: true } }, branch: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
      ...paging(p),
    }),
    db.purchase.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      purchaseNo: r.purchaseNo,
      vendor: r.vendor.name,
      branchCode: r.branch.code,
      billNo: r.billNo,
      billDate: r.billDate.toISOString(),
      total: Number(r.total),
      due: Math.round((Number(r.total) - Number(r.amountPaid)) * 100) / 100,
      status: r.status,
    })),
  };
}
export type PurchaseRow = Awaited<ReturnType<typeof listPurchases>>["rows"][number];

export async function getPurchase(user: CurrentUser, id: string) {
  const p = await db.purchase.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      vendor: true,
      branch: { select: { id: true, name: true, gstRegistrationId: true } },
      createdBy: { select: { name: true } },
      items: { include: { part: { select: { sku: true, name: true, unit: { select: { symbol: true } } } } } },
      payments: {
        include: { paymentMode: { select: { name: true } }, paidBy: { select: { name: true } } },
        orderBy: { paidAt: "asc" },
      },
    },
  });
  if (!p) return null;
  const scope = branchConstraint(user.access, "purchases.view", null);
  if (scope.branchIds && !scope.branchIds.includes(p.branchId)) return null;
  return p;
}

/** Payment modes + cash/bank accounts grouped by branch, for payment forms. */
export async function paymentFormOptions(organizationId: string, branchIds: string[]) {
  const [modes, accounts] = await Promise.all([
    db.paymentMode.findMany({ where: { organizationId, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.moneyAccount.findMany({
      where: { organizationId, isActive: true, branchId: { in: branchIds } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    modes: modes.map((m) => ({ value: m.id, label: m.name, requiresReference: m.requiresReference })),
    accounts: accounts.map((a) => ({ value: a.id, label: a.name, branchId: a.branchId, type: a.type })),
  };
}

export async function vendorOptions(organizationId: string) {
  const v = await db.vendor.findMany({
    where: { organizationId, isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return v.map((x) => ({ value: x.id, label: x.name }));
}
