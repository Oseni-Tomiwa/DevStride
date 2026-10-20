import {
  AUTH_CONFIRM_REDIRECT_URL,
  AUTH_RECOVERY_REDIRECT_URL,
  parseAuthLink,
} from "./auth-links";

describe("parseAuthLink", () => {
  it("accepts an allowlisted confirmation callback", () => {
    expect(
      parseAuthLink(
        "devstride://auth/confirm?code=confirmation-code-123&sb_flow_id=abcdef1234567890",
      ),
    ).toMatchObject({
      ok: true,
      link: { kind: "confirmation", code: "confirmation-code-123", flowId: "abcdef1234567890" },
    });
  });

  it("accepts an allowlisted recovery callback", () => {
    expect(parseAuthLink("devstride://auth/recovery?code=recovery-code-123")).toMatchObject({
      ok: true,
      link: { kind: "recovery", code: "recovery-code-123", flowId: null },
    });
  });

  it("exports exact stable development redirect URLs", () => {
    expect(AUTH_CONFIRM_REDIRECT_URL).toBe("devstride://auth/confirm");
    expect(AUTH_RECOVERY_REDIRECT_URL).toBe("devstride://auth/recovery");
  });

  it.each([
    "other://auth/confirm?code=confirmation-code-123",
    "devstride://other/confirm?code=confirmation-code-123",
    "devstride://auth/other?code=confirmation-code-123",
  ])("rejects a non-allowlisted route: %s", (url) => {
    expect(parseAuthLink(url)).toEqual({ ok: false, reason: "unsupported" });
  });

  it.each([
    "devstride://auth/confirm",
    "devstride://auth/confirm?code=short",
    "devstride://auth/confirm?code=valid-code-123&code=second-code-456",
    "devstride://auth/confirm?code=valid-code-123&next=https%3A%2F%2Fevil.example",
    "devstride://auth/confirm?code=valid-code-123#access_token=secret",
  ])("rejects missing, malformed, duplicated, or augmented authorization data: %s", (url) => {
    expect(parseAuthLink(url)).toMatchObject({ ok: false });
  });

  it("rejects malformed flow identifiers", () => {
    expect(
      parseAuthLink("devstride://auth/recovery?code=recovery-code-123&sb_flow_id=bad%20flow"),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("returns a content-free stable fingerprint for duplicate delivery detection", () => {
    const first = parseAuthLink("devstride://auth/recovery?code=recovery-code-123");
    const second = parseAuthLink("devstride://auth/recovery?code=recovery-code-123");
    expect(first.ok && first.link.fingerprint).toBe(second.ok && second.link.fingerprint);
    expect(first.ok && first.link.fingerprint).not.toContain("recovery-code-123");
  });
});
