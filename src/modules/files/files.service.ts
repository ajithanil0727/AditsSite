import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { writeAudit, type AuditActor } from "@/modules/audit/audit.service";
import { ActionError } from "@/modules/rbac/action";

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
// SVG is deliberately not accepted: it can carry scripts.

export async function saveUpload(
  actor: AuditActor & { userId: string },
  file: File,
  opts: { allowed: Record<string, string>; maxBytes: number; isPublic: boolean; folder: string },
) {
  const ext = opts.allowed[file.type];
  if (!ext) throw new ActionError(`Unsupported file type. Allowed: ${Object.values(opts.allowed).join(", ")}.`);
  if (file.size > opts.maxBytes)
    throw new ActionError(`File is too large (max ${Math.round(opts.maxBytes / 1024 / 1024)} MB).`);

  const key = `${actor.organizationId}/${opts.folder}/${randomUUID()}.${ext}`;
  await storage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
  const asset = await db.fileAsset.create({
    data: {
      organizationId: actor.organizationId,
      storageKey: key,
      originalName: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      isPublic: opts.isPublic,
      folder: opts.folder,
      uploadedById: actor.userId,
    },
  });
  await writeAudit(db, actor, { action: "CREATE", entityType: "FileAsset", entityId: asset.id, after: asset });
  return asset;
}
