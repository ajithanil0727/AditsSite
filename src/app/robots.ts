import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/print/", "/preview/", "/login"] },
    sitemap: new URL("/sitemap.xml", env.APP_URL).toString(),
  };
}
