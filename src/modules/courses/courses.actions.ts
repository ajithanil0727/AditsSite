"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { defineAction } from "@/modules/rbac/action";
import { batchSchema, courseSchema, feePlanSchema, modulesSchema } from "./courses.schemas";
import { saveBatch, saveCourse, saveFeePlan, saveModules } from "./courses.service";

export const saveCourseAction = defineAction(
  { permission: "courses.manage", schema: courseSchema },
  async (input, ctx) => {
    const id = await saveCourse(ctx, input);
    if (!input.id) redirect(`/admin/courses/${id}`);
    refresh();
  },
);

export const saveModulesAction = defineAction(
  { permission: "courses.manage", schema: modulesSchema },
  async (input, ctx) => {
    await saveModules(ctx, input);
    refresh();
  },
);

export const saveFeePlanAction = defineAction(
  { permission: "courses.manage", schema: feePlanSchema },
  async (input, ctx) => {
    await saveFeePlan(ctx, input);
    refresh();
  },
);

export const saveBatchAction = defineAction(
  { permission: (i) => (i.id ? "batches.update" : "batches.create"), schema: batchSchema },
  async (input, ctx) => {
    const id = await saveBatch(ctx, input);
    if (!input.id) redirect(`/admin/batches/${id}`);
    refresh();
  },
);
