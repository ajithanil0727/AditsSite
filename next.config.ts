import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Website images are served by /api/files/[id] (public files only). Nothing else is optimised.
    localPatterns: [{ pathname: "/api/files/**", search: "" }],
    qualities: [75],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    instantInsights: {
      // The admin panel is per-user and dynamic by design. Only segments that export `instant`
      // (the public website, Phase 4) are validated for instant navigation.
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
