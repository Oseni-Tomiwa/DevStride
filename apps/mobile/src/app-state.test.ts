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

  it("gives a recovery callback precedence over an existing authenticated session", () => {
    const loading = mobileAppReducer(initialAppState, {
      type: "authLinkStarted",
      kind: "recovery",
    });
    expect(loading).toEqual({ status: "auth_link_loading", kind: "recovery" });
    expect(mobileAppReducer(loading, { type: "sessionResolved", session })).toEqual(loading);

    const recovering = mobileAppReducer(loading, { type: "recoveryReady", session });
    expect(recovering).toEqual({ status: "recovery", session });
    expect(mobileAppReducer(recovering, { type: "sessionResolved", session })).toEqual(
      recovering,
    );
  });

  it("allows an exchanged confirmation session to enter profile validation", () => {
    const loading = { status: "auth_link_loading", kind: "confirmation" } as const;
    expect(mobileAppReducer(loading, { type: "sessionResolved", session })).toEqual({
      status: "loading_profile",
      session,
    });
  });

  it("shows a safe link error with recovery context", () => {
    const loading = { status: "auth_link_loading", kind: "recovery" } as const;
    expect(
      mobileAppReducer(loading, {
        type: "authLinkFailed",
        kind: "recovery",
        message: "This recovery link is invalid or expired.",
      }),
    ).toEqual({
      status: "auth_link_error",
      kind: "recovery",
      message: "This recovery link is invalid or expired.",
    });
  });

  it("requires normal sign-in after password recovery completes", () => {
    const recovering = { status: "recovery", session } as const;
    expect(mobileAppReducer(recovering, { type: "recoveryCompleted" })).toEqual({
      status: "signed_out",
      notice: "Password updated. Sign in with your new password.",
      initialRoute: "SignIn",
    });
  });

  it("can open password reset request from a recovery-link error", () => {
    const error = {
      status: "auth_link_error",
      kind: "recovery",
      message: "Link unavailable.",
    } as const;
    expect(mobileAppReducer(error, { type: "requestRecoveryEmail" })).toEqual({
      status: "signed_out",
      notice: null,
      initialRoute: "ForgotPassword",
    });
  });
});
