import type { MetadataRoute } from "next";

import { getPublicSiteOrigin } from "../lib/site-metadata";

const publicPaths = ["/", "/about", "/support", "/privacy", "/terms", "/login", "/sign-up"];

export function buildSitemap(origin = getPublicSiteOrigin()): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: new URL(path, origin).toString() }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap();
}
