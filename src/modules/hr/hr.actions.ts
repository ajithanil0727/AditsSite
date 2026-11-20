"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { DOCUMENT_TYPES, saveUpload } from "@/modules/files/files.service";
import { can } from "@/modules/rbac/access";
import { ActionError, defineAction, type ActionResult } from "@/modules/rbac/action";
import {
  advanceSchema,
  decisionSchema,
  employeeSchema,
  holidaySchema,
  incentiveSchema,
  leaveRequestSchema,
  payrollPaySchema,
  payrollRunSchema,
  salaryStructureSchema,
  staffAttendanceSchema,
} from "./hr.schemas";
import {
  addEmployeeDocument,
  addIncentive,
  cancelLeave,
  decideIncentive,
  decideLeave,
  deleteHoliday,
  giveAdvance,
  requestLeave,
  saveEmployee,
  saveHoliday,
  saveSalaryStructure,
  saveStaffAttendance,
  setEmployeeDeleted,
} from "./hr.service";
import { buildPayroll, deletePayrollDraft, finalizePayroll, payPayroll } from "./payroll.service";

const done = <T>(r: T) => {
  refresh();
  return r;
};
const id = z.object({ id: z.string().min(1) });

export const saveEmployeeAction = defineAction(
  { permission: (i) => (i.id ? "employees.update" : "employees.create"), schema: employeeSchema },
  async (input, ctx) => {
    const eid = await saveEmployee(ctx, input);
    if (!input.id) redirect(`/admin/hr/employees/${eid}`);
    return done(eid);
  },
);
export const deleteEmployeeAction = defineAction({ permission: "employees.delete", schema: z.object({ id: z.string().min(1), restore: z.boolean() }) }, async (i, ctx) =>
  done(await setEmployeeDeleted(ctx, i.id, !i.restore)),
);
export const saveSalaryAction = defineAction({ permission: "payroll.run", schema: salaryStructureSchema }, async (i, ctx) => done(await saveSalaryStructure(ctx, i)));
export const saveAttendanceAction = defineAction({ permission: "hr_attendance.mark", schema: staffAttendanceSchema }, async (i, ctx) =>
  done(await saveStaffAttendance(ctx, i)),
);
export const saveHolidayAction = defineAction({ permission: "masters.hr", schema: holidaySchema }, async (i, ctx) => done(await saveHoliday(ctx, i)));
export const deleteHolidayAction = defineAction({ permission: "masters.hr", schema: id }, async (i, ctx) => done(await deleteHoliday(ctx, i.id)));

export const requestLeaveAction = defineAction({ permission: "leaves.apply", schema: leaveRequestSchema }, async (i, ctx) => done(await requestLeave(ctx, i)));
export const decideLeaveAction = defineAction({ permission: "leaves.approve", schema: decisionSchema }, async (i, ctx) => done(await decideLeave(ctx, i)));
export const cancelLeaveAction = defineAction({ permission: "leaves.apply", schema: id }, async (i, ctx) => done(await cancelLeave(ctx, i.id)));

export const giveAdvanceAction = defineAction({ permission: "advances.manage", schema: advanceSchema }, async (i, ctx) => done(await giveAdvance(ctx, i)));
export const addIncentiveAction = defineAction({ permission: "incentives.manage", schema: incentiveSchema }, async (i, ctx) => done(await addIncentive(ctx, i)));
export const decideIncentiveAction = defineAction({ permission: "incentives.approve", schema: decisionSchema }, async (i, ctx) => done(await decideIncentive(ctx, i)));

export const buildPayrollAction = defineAction({ permission: "payroll.run", schema: payrollRunSchema }, async (i, ctx) => {
  const r = await buildPayroll(ctx, i);
  redirect(`/admin/hr/payroll/${r.id}${r.skipped.length ? `?skipped=${encodeURIComponent(r.skipped.join(", "))}` : ""}`);
});
export const finalizePayrollAction = defineAction({ permission: "payroll.finalize", schema: id }, async (i, ctx) => done(await finalizePayroll(ctx, i.id)));
export const payPayrollAction = defineAction({ permission: "payroll.mark_paid", schema: payrollPaySchema }, async (i, ctx) => done(await payPayroll(ctx, i)));
export const deletePayrollAction = defineAction({ permission: "payroll.run", schema: id }, async (i, ctx) => {
  await deletePayrollDraft(ctx, i.id);
  redirect("/admin/hr/payroll");
});

/** Upload an employee document (Aadhaar, certificates…), private. FormData: file, employeeId, label. */
export async function uploadEmployeeDocAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    if (!can(user.access, "employees.update")) return { ok: false, error: "You don't have permission to do this." };
    const file = z.instanceof(File).safeParse(formData.get("file"));
    const meta = z.object({ employeeId: z.string().min(1), label: z.string().trim().min(2).max(60) }).safeParse({
      employeeId: formData.get("employeeId"),
      label: formData.get("label"),
    });
    if (!file.success || file.data.size === 0) return { ok: false, error: "Choose a file to upload." };
    if (!meta.success) return { ok: false, error: "Name the document (e.g. Aadhaar)." };
    const actor = { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) };
    const asset = await saveUpload(actor, file.data, { allowed: DOCUMENT_TYPES, maxBytes: 8 * 1024 * 1024, isPublic: false, folder: "employees" });
    await addEmployeeDocument({ user, activeBranchId: null, actor }, meta.data.employeeId, asset.id, meta.data.label);
    refresh();
    return { ok: true, data: { id: asset.id } };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[uploadEmployeeDoc]", e);
    return { ok: false, error: "Upload failed. Please try again." };
  }
}
