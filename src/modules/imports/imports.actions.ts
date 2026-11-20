"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getActiveBranchId, getCurrentUser, getRequestMeta } from "@/modules/auth/current";
import { saveUpload } from "@/modules/files/files.service";
import { can } from "@/modules/rbac/access";
import { ActionError, type ActionContext, type ActionResult } from "@/modules/rbac/action";
import { IMPORT_ENTITIES, IMPORT_SPECS } from "./import-logic";
import { checkImport, runImport, type CheckResult } from "./imports.service";

const XLSX = { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx" };
const MAX_BYTES = 5 * 1024 * 1024;

/** FormData: entity, file, mode = "check" | "import". Check first; import only when there are no problems. */
export async function importAction(
  formData: FormData,
): Promise<ActionResult<{ check?: CheckResult; imported?: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
    const entity = z.enum(IMPORT_ENTITIES).safeParse(formData.get("entity"));
    if (!entity.success) return { ok: false, error: "Pick what to import." };
    if (!can(user.access, IMPORT_SPECS[entity.data].permission))
      return { ok: false, error: "You don't have permission to do this." };
    const file = z.instanceof(File).safeParse(formData.get("file"));
    if (!file.success || file.data.size === 0) return { ok: false, error: "Choose the filled template (.xlsx)." };
    if (!(file.data.type in XLSX) && !file.data.name.toLowerCase().endsWith(".xlsx"))
      return { ok: false, error: "Upload an .xlsx file (Excel)." };
    if (file.data.size > MAX_BYTES) return { ok: false, error: "The file is too large (max 5 MB)." };
    const actor = { organizationId: user.organizationId, userId: user.id, ...(await getRequestMeta()) };
    const ctx: ActionContext = { user, activeBranchId: await getActiveBranchId(user), actor };
    const buffer = await file.data.arrayBuffer();
    if (formData.get("mode") !== "import")
      return { ok: true, data: { check: await checkImport(ctx, entity.data, buffer) } };
    // Keep the uploaded file with the import record (private).
    const typed = new File([buffer], file.data.name, { type: Object.keys(XLSX)[0] });
    const asset = await saveUpload(actor, typed, {
      allowed: XLSX,
      maxBytes: MAX_BYTES,
      isPublic: false,
      folder: "imports",
    });
    const r = await runImport(ctx, entity.data, buffer, asset.id);
    refresh();
    return { ok: true, data: { imported: r.imported } };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("[import]", e);
    return { ok: false, error: "The import failed. Nothing was saved. Please try again." };
  }
}
