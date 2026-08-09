import { describe, expect, it } from "vitest";

import { isProtectedPath } from "./protected-routes";

describe("protected routes", () => {
  it("protects dashboard and onboarding paths", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/account")).toBe(true);
  });

  it("leaves public paths accessible", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/sign-up")).toBe(false);
  });
});
