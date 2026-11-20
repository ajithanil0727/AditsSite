"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import {
  assessmentSchema,
  certificateRulesSchema,
  issueCertificateSchema,
  marksSchema,
  placementOptOutSchema,
  revokeCertificateSchema,
} from "./academics.schemas";
import {
  deleteAssessment,
  issueCertificate,
  revokeCertificate,
  saveAssessment,
  saveCertificateRules,
  saveMarks,
  setPlacementOptOut,
} from "./academics.service";

const done = <T>(r: T) => {
  refresh();
  return r;
};
const id = z.object({ id: z.string().min(1) });

export const saveAssessmentAction = defineAction(
  { permission: "assessments.manage", schema: assessmentSchema },
  async (i, ctx) => done({ id: await saveAssessment(ctx, i) }),
);
export const deleteAssessmentAction = defineAction({ permission: "assessments.manage", schema: id }, async (i, ctx) => {
  const batchId = await deleteAssessment(ctx, i.id);
  redirect(`/admin/batches/${batchId}`);
});
export const saveMarksAction = defineAction(
  { permission: "assessments.enter_marks", schema: marksSchema },
  async (i, ctx) => done(await saveMarks(ctx, i)),
);
export const issueCertificateAction = defineAction(
  { permission: "certificates.issue", schema: issueCertificateSchema },
  async (i, ctx) => done({ id: await issueCertificate(ctx, i) }),
);
export const revokeCertificateAction = defineAction(
  { permission: "certificates.revoke", schema: revokeCertificateSchema },
  async (i, ctx) => done(await revokeCertificate(ctx, i)),
);
export const saveCertificateRulesAction = defineAction(
  { permission: "settings.update", schema: certificateRulesSchema },
  async (i, ctx) => done(await saveCertificateRules(ctx, i)),
);
// Placement officers or student editors (checked per branch in the service).
export const setPlacementOptOutAction = defineAction(
  { permission: "students.view", schema: placementOptOutSchema },
  async (i, ctx) => done(await setPlacementOptOut(ctx, i)),
);
