import { initialAppState, mobileAppReducer } from "./app-state";
import type { AuthenticatedUser, Profile, SessionSnapshot } from "./types";

const session: SessionSnapshot = { access_token: "token", user: { id: "user-id" } };
const user: AuthenticatedUser = { id: "user-id", email: "ada@example.com" };
const profile = {
  id: "profile-id",
  user_id: "user-id",
  display_name: "Ada",
  current_level: "mid_level",
  target_role: "backend_engineer",
  preferred_stack: ["Python"],
  communication_goal: "technical_interviews",
  feedback_preference: "balanced",
  onboarding_completed: true,
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-02T12:00:00Z",
} satisfies Profile;

describe("mobileAppReducer", () => {
  it("moves from booting to signed out when no persisted session exists", () => {
    expect(mobileAppReducer(initialAppState, { type: "sessionResolved", session: null })).toEqual({
      status: "signed_out",
      notice: null,
    });
  });

  it("loads an authenticated profile after restoring a session", () => {
    const loading = mobileAppReducer(initialAppState, { type: "sessionResolved", session });
    expect(loading).toEqual({ status: "loading_profile", session });

    expect(mobileAppReducer(loading, { type: "profileLoaded", user, profile })).toEqual({
      status: "authenticated",
      session,
      user,
      profile,
    });
  });

  it("shows the bounded profile-required state for a 404", () => {
    const loading = { status: "loading_profile", session } as const;
    expect(mobileAppReducer(loading, { type: "profileMissing" })).toEqual({
      status: "profile_missing",
      session,
    });
  });

  it("returns to sign-in with a safe notice when authorization expires", () => {
    const expired = mobileAppReducer(initialAppState, { type: "unauthorized" });
    expect(expired).toEqual({
      status: "signed_out",
      notice: "Your session expired. Sign in again.",
    });
    expect(mobileAppReducer(expired, { type: "sessionResolved", session: null })).toEqual(expired);
  });

  it("allows a failed profile request to be retried", () => {
    const failed = { status: "load_error", session, message: "Unable to reach DevStride." } as const;
    expect(mobileAppReducer(failed, { type: "retry" })).toEqual({
      status: "loading_profile",
      session,
    });
  });
});
