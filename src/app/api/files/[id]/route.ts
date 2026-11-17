import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { getCurrentUser } from "@/modules/auth/current";

/** Serve an uploaded file. Public files (website media, logo) are open; others need a signed-in user of the same organisation. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const asset = await db.fileAsset.findFirst({ where: { id, deletedAt: null } });
  if (!asset) return new Response("Not found", { status: 404 });

  if (!asset.isPublic) {
    const user = await getCurrentUser();
    if (!user || user.organizationId !== asset.organizationId) return new Response("Not found", { status: 404 });
  }

  const data = await storage().get(asset.storageKey);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": asset.isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  });
}
