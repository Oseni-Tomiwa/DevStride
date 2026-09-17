import { getUsableAccessToken } from "./session-token";

describe("getUsableAccessToken", () => {
  it("uses a current persisted access token", async () => {
    const auth = {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "current", expires_at: 2_000 } },
        error: null,
      }),
      refreshSession: jest.fn(),
    };

    await expect(getUsableAccessToken(auth, 1_000)).resolves.toBe("current");
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes a token that is about to expire", async () => {
    const auth = {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "old", expires_at: 1_020 } },
        error: null,
      }),
      refreshSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "refreshed", expires_at: 2_000 } },
        error: null,
      }),
    };

    await expect(getUsableAccessToken(auth, 1_000)).resolves.toBe("refreshed");
  });

  it.each([
    {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: new Error("read") }),
      refreshSession: jest.fn(),
    },
    {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "old", expires_at: 1_020 } },
        error: null,
      }),
      refreshSession: jest.fn().mockResolvedValue({
        data: { session: null },
        error: new Error("refresh"),
      }),
    },
  ])("returns null when session recovery fails", async (auth) => {
    await expect(getUsableAccessToken(auth, 1_000)).resolves.toBeNull();
  });

  it("returns null when persisted session storage is unavailable", async () => {
    const auth = {
      getSession: jest.fn().mockRejectedValue(new Error("storage unavailable")),
      refreshSession: jest.fn(),
    };

    await expect(getUsableAccessToken(auth, 1_000)).resolves.toBeNull();
  });
});
