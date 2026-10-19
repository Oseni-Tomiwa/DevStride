import {
  SessionValidationError,
  clearAuthSession,
  validateAuthenticatedSession,
} from "./session-validation";

describe("validateAuthenticatedSession", () => {
  it("accepts a valid restored Supabase user", async () => {
    const auth = {
      getUser: jest.fn(async () => ({ data: { user: { id: "user-id" } }, error: null })),
    };
    await expect(validateAuthenticatedSession(auth, "user-id")).resolves.toBeUndefined();
  });

  it("classifies a rejected or mismatched restored identity as invalid", async () => {
    const rejected = {
      getUser: jest.fn(async () => ({
        data: { user: null },
        error: { status: 401, message: "invalid JWT" },
      })),
    };
    await expect(validateAuthenticatedSession(rejected, "user-id")).rejects.toMatchObject({
      kind: "invalid",
    });

    const mismatched = {
      getUser: jest.fn(async () => ({ data: { user: { id: "other-user" } }, error: null })),
    };
    await expect(validateAuthenticatedSession(mismatched, "user-id")).rejects.toBeInstanceOf(
      SessionValidationError,
    );
  });

  it("classifies an ordinary network failure as temporary", async () => {
    const auth = { getUser: jest.fn().mockRejectedValue(new TypeError("Network request failed")) };
    await expect(validateAuthenticatedSession(auth, "user-id")).rejects.toMatchObject({
      kind: "temporary",
    });
  });

  it.each([408, 429, 500])("preserves the session for temporary HTTP %s responses", async (status) => {
    const auth = {
      getUser: jest.fn(async () => ({ data: { user: null }, error: { status } })),
    };
    await expect(validateAuthenticatedSession(auth, "user-id")).rejects.toMatchObject({
      kind: "temporary",
    });
  });

  it.each([400, 401, 403])("rejects authoritative HTTP %s auth failures", async (status) => {
    const auth = {
      getUser: jest.fn(async () => ({ data: { user: null }, error: { status } })),
    };
    await expect(validateAuthenticatedSession(auth, "user-id")).rejects.toMatchObject({
      kind: "invalid",
    });
  });
});

describe("clearAuthSession", () => {
  it("cleans local storage after a successful explicit sign out", async () => {
    const auth = { signOut: jest.fn(async () => ({ error: null })) };
    const cleanup = jest.fn(async () => undefined);
    await expect(clearAuthSession(auth, cleanup)).resolves.toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("still cleans local storage when Supabase sign out fails", async () => {
    const auth = { signOut: jest.fn().mockRejectedValue(new Error("network")) };
    const cleanup = jest.fn(async () => undefined);
    await expect(clearAuthSession(auth, cleanup)).resolves.toBeInstanceOf(Error);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
