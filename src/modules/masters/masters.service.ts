import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import type { CurrentUser } from "@/modules/auth/current";
import { branchConstraint, canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import { MASTERS, type MasterDef, type MasterKind, type Option } from "./registry";

/** Minimal delegate surface shared by all master models. */
type Delegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
};

function delegate(client: unknown, kind: MasterKind): Delegate {
  return (client as Record<string, Delegate>)[kind];
}

/** Models without their own organizationId are scoped through a parent. */
function orgWhere(kind: MasterKind, orgId: string): Record<string, unknown> {
  if (kind === "deviceModel") return { brand: { organizationId: orgId } };
  return { organizationId: orgId };
}

function hasIsActive(def: MasterDef) {
  return def.fields.some((f) => f.name === "isActive");
}

function titleField(def: MasterDef) {
  return def.columns[0];
}

/** Branch-scoped masters (cash/bank accounts) only show branches the user may manage. */
function scopeWhere(user: CurrentUser, def: MasterDef): Record<string, unknown> {
  if (!def.fields.some((f) => f.type === "ref" && f.ref === "branch")) return {};
  const c = branchConstraint(user.access, def.permission, null);
  return c.branchIds ? { branchId: { in: c.branchIds } } : {};
}

function plain(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

export async function listMaster(user: CurrentUser, def: MasterDef, q: string) {
  const title = titleField(def);
  const rows = await delegate(db, def.kind).findMany({
    where: {
      ...orgWhere(def.kind, user.organizationId),
      ...scopeWhere(user, def),
      ...(def.kind === "vendor" ? { deletedAt: null } : {}),
      ...(q ? { [title]: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: def.fields.some((f) => f.name === "sortOrder")
      ? [{ sortOrder: "asc" }, { [title]: "asc" }]
      : { [title]: "asc" },
    take: 500,
  });
  return rows.map(plain);
}

/** Options for every ref field of a master (label lookup + form selects). */
export async function refOptions(user: CurrentUser, def: MasterDef): Promise<Record<string, Option[]>> {
  const out: Record<string, Option[]> = {};
  for (const f of def.fields) {
    if (f.type !== "ref") continue;
    if (f.ref === "branch") {
      const scope = branchConstraint(user.access, def.permission, null);
      const branches = await db.branch.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          ...(scope.branchIds ? { id: { in: scope.branchIds } } : {}),
        },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      out[f.name] = branches.map((b) => ({ value: b.id, label: b.name }));
      continue;
    }
    const refDef = MASTERS[f.ref];
    const rows = await listMaster(user, refDef, "");
    out[f.name] = rows.map((r) => ({
      value: String(r.id),
      label:
        f.ref === "hsnSac"
          ? `${r.code} · ${r.description}`
          : f.ref === "taxRate"
            ? `${r.name}`
            : String(r[titleField(refDef)]),
    }));
  }
  return out;
}

export async function saveMaster(ctx: ActionContext, def: MasterDef, input: Record<string, unknown>) {
  const { id, ...data } = input;
  const orgId = ctx.user.organizationId;
  if (typeof data.branchId === "string" && !canAccessBranch(ctx.user.access, def.permission, data.branchId)) {
    throw new ActionError("You can't manage this branch.");
  }
  if (def.kind === "jobStatus" && data.isActive === false) {
    const key = data.systemKey as string;
    const others = await db.jobStatus.count({
      where: {
        organizationId: orgId,
        systemKey: key as never,
        isActive: true,
        ...(id ? { id: { not: id as string } } : {}),
      },
    });
    if (others === 0) throw new ActionError(`Keep at least one active status for the ${key.replace("_", " ")} stage.`);
  }

  await db.$transaction(async (tx) => {
    const d = delegate(tx, def.kind);
    const createData = def.kind === "deviceModel" ? data : { ...data, organizationId: orgId };
    if (!id) {
      const created = await d.create({ data: createData });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: cap(def.kind),
        entityId: String(created.id),
        after: created,
      });
      return;
    }
    const before = await d.findFirst({ where: { id, ...orgWhere(def.kind, orgId) } });
    if (!before) throw new ActionError(`That ${def.singular} no longer exists.`);
    if (typeof before.branchId === "string" && !canAccessBranch(ctx.user.access, def.permission, before.branchId)) {
      throw new ActionError("You can't manage this branch.");
    }
    const after = await d.update({ where: { id }, data });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: cap(def.kind),
      entityId: String(id),
      before,
      after,
    });
  });
}

export function supportsDeactivate(def: MasterDef) {
  return hasIsActive(def);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
