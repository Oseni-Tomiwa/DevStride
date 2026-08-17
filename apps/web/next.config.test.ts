import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("production media permissions policy", () => {
  it("allows only the app origin to acquire local camera and microphone media", async () => {
    const headers = await nextConfig.headers?.();
    const policy = headers?.[0]?.headers?.find((header) => header.key === "Permissions-Policy");

    expect(policy?.value).toBe("camera=(self), microphone=(self), geolocation=()");
  });
});
