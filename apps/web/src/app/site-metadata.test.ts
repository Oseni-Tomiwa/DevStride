import { describe, expect, it, vi } from "vitest";

import { buildRobots } from "./robots";
import { buildSitemap } from "./sitemap";
import { createPublicMetadata, getConfiguredSiteOrigin } from "../lib/site-metadata";

describe("public metadata routes", () => {
  it("ignores malformed site origins instead of failing metadata generation", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not-a-url");
    expect(getConfiguredSiteOrigin()).toBeUndefined();
    expect(createPublicMetadata("About", "Description", "/about").alternates).toEqual({ canonical: "/about" });
    vi.unstubAllEnvs();
  });

  it("fails production metadata when the public site origin is invalid", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not-a-url");
    expect(() => createPublicMetadata("About", "Description", "/about")).toThrow(
      "NEXT_PUBLIC_SITE_URL",
    );
    vi.unstubAllEnvs();
  });

  it("includes only public sitemap pages", () => {
    const entries = buildSitemap(new URL("https://devstride.example"));
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://devstride.example/about");
    expect(urls).toContain("https://devstride.example/terms");
    expect(urls.some((url) => /dashboard|conversations|memories|progress|goals/.test(url))).toBe(false);
  });

  it("keeps private and auth areas out of robots indexing", () => {
    const robots = buildRobots(new URL("https://devstride.example"));
    const disallowed = Array.isArray(robots.rules) ? robots.rules.flatMap((rule) => rule.disallow ?? []) : robots.rules.disallow ?? [];
    expect(disallowed).toEqual(expect.arrayContaining(["/dashboard", "/conversations", "/auth", "/login"]));
    expect(robots.sitemap).toBe("https://devstride.example/sitemap.xml");
  });
});
