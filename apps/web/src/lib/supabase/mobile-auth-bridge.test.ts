import { describe, expect, it } from "vitest";

import { parseMobileAuthBridgeFragment } from "./mobile-auth-bridge";

const options = {
  siteOrigin: "https://dev-stride-web.vercel.app",
  supabaseOrigin: "https://project-ref.supabase.co",
};

function confirmationUrl(type: "email" | "signup" | "recovery", redirectTo: string) {
  const url = new URL("https://project-ref.supabase.co/auth/v1/verify");
  url.searchParams.set("token", "safe-token-hash-1234567890");
  url.searchParams.set("type", type);
  url.searchParams.set("redirect_to", redirectTo);
  return `#${url.toString()}`;
}

describe("parseMobileAuthBridgeFragment", () => {
  it("accepts a signup verification for the exact mobile confirmation destination", () => {
    const result = parseMobileAuthBridgeFragment(
      confirmationUrl(
        "signup",
        "devstride://auth/confirm?sb_flow_id=abcdef1234567890",
      ),
      options,
    );

    expect(result).toMatchObject({ ok: true, kind: "confirmation" });
  });

  it("accepts Supabase's email verification type for signup confirmation", () => {
    expect(
      parseMobileAuthBridgeFragment(
        confirmationUrl("email", "devstride://auth/confirm"),
        options,
      ),
    ).toMatchObject({ ok: true, kind: "confirmation" });
  });

  it("accepts a recovery verification for the exact mobile recovery destination", () => {
    const result = parseMobileAuthBridgeFragment(
      confirmationUrl("recovery", "devstride://auth/recovery"),
      options,
    );

    expect(result).toMatchObject({ ok: true, kind: "recovery" });
  });

  it("accepts the URL-escaped fragment emitted by Go HTML templates", () => {
    const raw = confirmationUrl("signup", "devstride://auth/confirm").slice(1);
    expect(parseMobileAuthBridgeFragment(`#${encodeURIComponent(raw)}`, options)).toMatchObject({
      ok: true,
      kind: "confirmation",
    });
  });

  it("preserves the existing same-origin web callback flow", () => {
    const result = parseMobileAuthBridgeFragment(
      confirmationUrl(
        "recovery",
        "https://dev-stride-web.vercel.app/auth/callback?next=%2Freset-password&returnTo=%2Fdashboard",
      ),
      options,
    );

    expect(result).toMatchObject({ ok: true, kind: "recovery" });
  });

  it.each([
    ["wrong Supabase origin", confirmationUrl("signup", "devstride://auth/confirm").replace("project-ref.supabase.co", "evil.example")],
    ["wrong verification path", confirmationUrl("signup", "devstride://auth/confirm").replace("/auth/v1/verify", "/auth/v1/other")],
    ["crossed mobile type", confirmationUrl("signup", "devstride://auth/recovery")],
    ["custom-scheme credentials", confirmationUrl("signup", "devstride://user:password@auth/confirm")],
    ["custom-scheme port", confirmationUrl("signup", "devstride://auth:444/confirm")],
    ["open redirect", confirmationUrl("recovery", "https://evil.example/auth/callback")],
    ["extra verification parameter", `${confirmationUrl("signup", "devstride://auth/confirm")}&next=https://evil.example`],
    ["malformed flow id", confirmationUrl("signup", "devstride://auth/confirm?sb_flow_id=bad%20flow")],
  ])("rejects %s", (_name, fragment) => {
    expect(parseMobileAuthBridgeFragment(fragment, options)).toEqual({
      ok: false,
      reason: "invalid_link",
    });
  });

  it("rejects missing, duplicated, or malformed one-time fields", () => {
    const missing = new URL("https://project-ref.supabase.co/auth/v1/verify");
    missing.searchParams.set("type", "signup");
    missing.searchParams.set("redirect_to", "devstride://auth/confirm");

    const duplicated = new URL(confirmationUrl("signup", "devstride://auth/confirm").slice(1));
    duplicated.searchParams.append("token", "another-safe-token-123456");

    expect(parseMobileAuthBridgeFragment(`#${missing}`, options)).toMatchObject({ ok: false });
    expect(parseMobileAuthBridgeFragment(`#${duplicated}`, options)).toMatchObject({ ok: false });
    expect(parseMobileAuthBridgeFragment("#not-a-url", options)).toMatchObject({ ok: false });
  });
});
