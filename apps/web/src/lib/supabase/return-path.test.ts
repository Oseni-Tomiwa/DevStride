import { describe, expect, it } from "vitest";

import { getSafeReturnPath } from "./return-path";

describe("safe return paths", () => {
  it("allows internal paths and rejects external URL forms", () => {
    expect(getSafeReturnPath("/conversations/abc")).toBe("/conversations/abc");
    expect(getSafeReturnPath("//evil.example")).toBe("/dashboard");
    expect(getSafeReturnPath("https://evil.example")).toBe("/dashboard");
    expect(getSafeReturnPath("/\\evil.example")).toBe("/dashboard");
  });
});
