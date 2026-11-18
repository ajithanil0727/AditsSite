import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/modules/audit/audit.service";
import { canAccessBranch } from "@/modules/rbac/access";
import { ActionError, type ActionContext } from "@/modules/rbac/action";
import {
  slugify,
  type batchSchema,
  type courseSchema,
  type feePlanSchema,
  type modulesSchema,
} from "./courses.schemas";

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export async function saveCourse(ctx: ActionContext, input: z.output<typeof courseSchema>) {
  const orgId = ctx.user.organizationId;
  const { id, ...rest } = input;
  if (rest.imageId) {
    const img = await db.fileAsset.findFirst({
      where: { id: rest.imageId, organizationId: orgId, deletedAt: null, isPublic: true },
    });
    if (!img) throw new ActionError("Pick the course image from the media library.");
  }
  const data = {
    ...rest,
    slug: rest.slug || slugify(rest.name),
    taxRateId: rest.gstMode === "EXEMPT" ? null : rest.taxRateId,
    // Markdown for the public course page, stored as a JSON string.
    description: rest.description ? rest.description : Prisma.DbNull,
  };
  return db.$transaction(async (tx) => {
    if (!id) {
      const course = await tx.course.create({
        data: {
          ...data,
          organizationId: orgId,
          feePlans: {
            create: {
              name: "Full payment",
              items: { create: [{ label: "Full fee", percentOfFee: 100, dueAfterDays: 0 }] },
            },
          },
        },
      });
      await writeAudit(tx, ctx.actor, { action: "CREATE", entityType: "Course", entityId: course.id, after: course });
      return course.id;
    }
    const before = await tx.course.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!before) throw new ActionError("Course not found.");
    const after = await tx.course.update({ where: { id }, data });
    await writeAudit(tx, ctx.actor, { action: "UPDATE", entityType: "Course", entityId: id, before, after });
    return id;
  });
}

export async function saveModules(ctx: ActionContext, input: z.output<typeof modulesSchema>) {
  await db.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: input.courseId, organizationId: ctx.user.organizationId },
    });
    if (!course) throw new ActionError("Course not found.");
    const before = await tx.courseModule.findMany({ where: { courseId: course.id }, orderBy: { sortOrder: "asc" } });
    await tx.courseModule.deleteMany({ where: { courseId: course.id } });
    await tx.courseModule.createMany({
      data: input.modules.map((m, i) => ({ courseId: course.id, title: m.title, hours: m.hours, sortOrder: i })),
    });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Course",
      entityId: course.id,
      before: { modules: before.map((m) => m.title) },
      after: { modules: input.modules.map((m) => m.title) },
    });
  });
}

export async function saveFeePlan(ctx: ActionContext, input: z.output<typeof feePlanSchema>) {
  await db.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: input.courseId, organizationId: ctx.user.organizationId },
    });
    if (!course) throw new ActionError("Course not found.");
    const items = { create: input.items.map((i, idx) => ({ ...i, sortOrder: idx })) };
    if (input.id) {
      const plan = await tx.feePlanTemplate.findFirst({ where: { id: input.id, courseId: course.id } });
      if (!plan) throw new ActionError("Fee plan not found.");
      await tx.feePlanTemplateItem.deleteMany({ where: { templateId: plan.id } });
      await tx.feePlanTemplate.update({
        where: { id: plan.id },
        data: { name: input.name, isActive: input.isActive, items },
      });
    } else {
      await tx.feePlanTemplate.create({
        data: { courseId: course.id, name: input.name, isActive: input.isActive, items },
      });
    }
    await writeAudit(tx, ctx.actor, {
      action: input.id ? "UPDATE" : "CREATE",
      entityType: "FeePlanTemplate",
      entityId: input.id ?? course.id,
      after: input,
    });
  });
}

export async function saveBatch(ctx: ActionContext, input: z.output<typeof batchSchema>) {
  const orgId = ctx.user.organizationId;
  const perm = input.id ? "batches.update" : "batches.create";
  if (!canAccessBranch(ctx.user.access, perm, input.branchId))
    throw new ActionError("You can't manage batches in this branch.");
  const { id, ...rest } = input;
  return db.$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { id: rest.courseId, organizationId: orgId, deletedAt: null } });
    if (!course) throw new ActionError("Course not found.");
    if (rest.trainerId) {
      const t = await tx.user.findFirst({
        where: {
          id: rest.trainerId,
          organizationId: orgId,
          isActive: true,
          deletedAt: null,
          branches: { some: { branchId: rest.branchId } },
        },
      });
      if (!t) throw new ActionError("That trainer isn't active in this branch.");
    }
    const data = {
      ...rest,
      startDate: dateOnly(rest.startDate),
      endDate: rest.endDate ? dateOnly(rest.endDate) : null,
    };
    if (!id) {
      const batch = await tx.batch.create({ data: { ...data, organizationId: orgId } });
      await writeAudit(tx, ctx.actor, {
        action: "CREATE",
        entityType: "Batch",
        entityId: batch.id,
        branchId: batch.branchId,
        after: batch,
      });
      return batch.id;
    }
    const before = await tx.batch.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
    if (!before) throw new ActionError("Batch not found.");
    if (!canAccessBranch(ctx.user.access, "batches.update", before.branchId)) throw new ActionError("Not your branch.");
    if (before.courseId !== data.courseId) {
      const enrolled = await tx.enrollment.count({ where: { batchId: id, deletedAt: null } });
      if (enrolled > 0) throw new ActionError("Students are enrolled; the course can't change.");
    }
    if (data.capacity < before.capacity) {
      const active = await tx.enrollment.count({ where: { batchId: id, status: "ACTIVE", deletedAt: null } });
      if (active > data.capacity)
        throw new ActionError(`${active} students are active in this batch; capacity can't be lower.`);
    }
    const after = await tx.batch.update({ where: { id }, data });
    await writeAudit(tx, ctx.actor, {
      action: "UPDATE",
      entityType: "Batch",
      entityId: id,
      branchId: after.branchId,
      before,
      after,
    });
    return id;
  });
}
