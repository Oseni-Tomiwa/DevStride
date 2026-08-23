import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "../lib/site-metadata";

export function buildRobots(origin = getPublicSiteOrigin()): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/account",
        "/profile",
        "/onboarding",
        "/conversations",
        "/goals",
        "/progress",
        "/memories",
        "/realtime",
        "/e2e",
        "/auth",
        "/login",
        "/sign-up",
      ],
    },
    sitemap: new URL("/sitemap.xml", origin).toString(),
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
