import type { Metadata } from "next";

const DEFAULT_SITEMAP_ORIGIN = "http://localhost:3000";

export function getConfiguredSiteOrigin(): URL | undefined {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return undefined;

  try {
    const origin = new URL(configured);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return undefined;
    return new URL(origin.origin);
  } catch {
    return undefined;
  }
}

export function getPublicSiteOrigin(): URL {
  return getConfiguredSiteOrigin() ?? new URL(DEFAULT_SITEMAP_ORIGIN);
}

export function createPublicMetadata(title: string, description: string, path: string): Metadata {
  const siteOrigin = getConfiguredSiteOrigin();
  return {
    metadataBase: siteOrigin,
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} | DevStride`, description, type: "website", url: path },
    twitter: { card: "summary", title: `${title} | DevStride`, description },
  };
}
