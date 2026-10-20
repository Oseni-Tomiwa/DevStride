import type { SessionSnapshot } from "../types";
import {
  exchangeParsedAuthLink,
  requestPasswordReset,
  resendVerification,
  signInWithEmail,
  signUpWithEmail,
  updateRecoveryPassword,
} from "./auth-service";
import {
  AUTH_CONFIRM_REDIRECT_URL,
  AUTH_RECOVERY_REDIRECT_URL,
  type ParsedAuthLink,
} from "./auth-links";

const session: SessionSnapshot = { access_token: "token", user: { id: "user-id" } };

function createAuth() {
  return {
    exchangeCodeForSession: jest.fn(),
    getUser: jest.fn(),
    resend: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    updateUser: jest.fn(),
  };
}

describe("email/password auth service", () => {
  it("signs in with a normalized email and preserves a successful session event flow", async () => {
    const auth = createAuth();
    auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    await expect(signInWithEmail(auth, "ada@example.com", "password")).resolves.toEqual({
      ok: true,
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "password",
    });
  });

  it("does not describe a thrown network failure as invalid credentials", async () => {
    const auth = createAuth();
    auth.signInWithPassword.mockRejectedValue(new TypeError("Network request failed"));
    await expect(signInWithEmail(auth, "ada@example.com", "password")).resolves.toMatchObject({
      ok: false,
      error: { kind: "network" },
    });
  });

  it("creates a PKCE signup and returns pending verification without a session", async () => {
    const auth = createAuth();
    auth.signUp.mockResolvedValue({ data: { user: { id: "user-id" }, session: null }, error: null });
    await expect(signUpWithEmail(auth, "ada@example.com", "password")).resolves.toEqual({
      ok: true,
      outcome: "verification_pending",
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "password",
      options: { emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL },
    });
  });

  it("returns authenticated when signup immediately returns a session", async () => {
    const auth = createAuth();
    auth.signUp.mockResolvedValue({ data: { user: { id: "user-id" }, session }, error: null });
    await expect(signUpWithEmail(auth, "ada@example.com", "password")).resolves.toEqual({
      ok: true,
      outcome: "authenticated",
      session,
    });
  });

  it("uses a generic pending result for an existing-account response", async () => {
    const auth = createAuth();
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "user_already_exists", status: 422 },
    });
    await expect(signUpWithEmail(auth, "ada@example.com", "password")).resolves.toEqual({
      ok: true,
      outcome: "verification_pending",
    });
  });

  it("resends signup verification with the exact confirmation redirect", async () => {
    const auth = createAuth();
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await expect(resendVerification(auth, "ada@example.com")).resolves.toEqual({ ok: true });
    expect(auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "ada@example.com",
      options: { emailRedirectTo: AUTH_CONFIRM_REDIRECT_URL },
    });
  });

  it("requests recovery with the exact recovery redirect and generic success", async () => {
    const auth = createAuth();
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(requestPasswordReset(auth, "ada@example.com")).resolves.toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ada@example.com", {
      redirectTo: AUTH_RECOVERY_REDIRECT_URL,
    });
  });
});

describe("PKCE callback and recovery service", () => {
  const link: ParsedAuthLink = {
    code: "confirmation-code-123",
    fingerprint: "abc12345",
    flowId: "abcdef1234567890",
    kind: "confirmation",
  };

  it("exchanges the expected code and flow id, then validates the returned user", async () => {
    const auth = createAuth();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    await expect(exchangeParsedAuthLink(auth, link)).resolves.toEqual({ ok: true, session });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("confirmation-code-123", {
      flowId: "abcdef1234567890",
    });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("fails safely when the device-local PKCE verifier is missing", async () => {
    const auth = createAuth();
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthPKCECodeVerifierMissingError" },
    });
    await expect(exchangeParsedAuthLink(auth, link)).resolves.toMatchObject({
      ok: false,
      error: { kind: "invalid_link" },
    });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects a callback whose authoritative identity does not match the session", async () => {
    const auth = createAuth();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: "other-user" } }, error: null });
    await expect(exchangeParsedAuthLink(auth, link)).resolves.toMatchObject({
      ok: false,
      error: { kind: "invalid_link" },
    });
  });

  it("updates the recovery password without retaining it", async () => {
    const auth = createAuth();
    auth.updateUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    await expect(updateRecoveryPassword(auth, "new-password")).resolves.toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
  });
});
