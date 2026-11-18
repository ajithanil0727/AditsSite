import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { getSitemapEntries } from "@/modules/website/site.data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapEntries();
  return entries.map((e) => ({
    url: new URL(e.path, env.APP_URL).toString(),
    ...(e.updatedAt ? { lastModified: e.updatedAt } : {}),
    changeFrequency: e.path === "/" ? "weekly" : "monthly",
    priority: e.path === "/" ? 1 : e.path.split("/").length > 2 ? 0.6 : 0.8,
  }));
}
