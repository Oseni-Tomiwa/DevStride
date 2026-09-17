import { loadAuthenticatedProfile } from "./load-profile";
import type { AuthenticatedUser, Profile } from "./types";

describe("loadAuthenticatedProfile", () => {
  it("verifies the API user before requesting the profile", async () => {
    const calls: string[] = [];
    const user: AuthenticatedUser = { id: "user-id", email: "ada@example.com" };
    const profile = { user_id: "user-id" } as Profile;
    const api = {
      getCurrentUser: jest.fn(async () => {
        calls.push("auth/me");
        return user;
      }),
      getProfile: jest.fn(async () => {
        calls.push("profile/me");
        return profile;
      }),
    };

    await expect(loadAuthenticatedProfile(api)).resolves.toEqual({ user, profile });
    expect(calls).toEqual(["auth/me", "profile/me"]);
  });

  it("does not request a profile when user verification fails", async () => {
    const api = {
      getCurrentUser: jest.fn().mockRejectedValue(new Error("Unauthorized")),
      getProfile: jest.fn(),
    };

    await expect(loadAuthenticatedProfile(api)).rejects.toThrow("Unauthorized");
    expect(api.getProfile).not.toHaveBeenCalled();
  });
});
