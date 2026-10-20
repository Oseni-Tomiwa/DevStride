import type { AuthenticatedUser, Profile, SessionSnapshot } from "./types";

export type MobileAppState =
  | { status: "booting" }
  | {
      status: "signed_out";
      notice: string | null;
      initialRoute?: "SignIn" | "ForgotPassword";
    }
  | { status: "auth_link_loading"; kind: "confirmation" | "recovery" }
  | {
      status: "auth_link_error";
      kind: "confirmation" | "recovery" | null;
      message: string;
    }
  | { status: "recovery"; session: SessionSnapshot }
  | { status: "loading_profile"; session: SessionSnapshot }
  | {
      status: "authenticated";
      session: SessionSnapshot;
      user: AuthenticatedUser;
      profile: Profile;
    }
  | { status: "profile_missing"; session: SessionSnapshot }
  | { status: "load_error"; session: SessionSnapshot; message: string };

export type MobileAppAction =
  | { type: "sessionResolved"; session: SessionSnapshot | null }
  | { type: "authLinkStarted"; kind: "confirmation" | "recovery" }
  | {
      type: "authLinkFailed";
      kind: "confirmation" | "recovery" | null;
      message: string;
    }
  | { type: "recoveryReady"; session: SessionSnapshot }
  | { type: "recoveryCompleted" }
  | { type: "requestRecoveryEmail" }
  | { type: "profileLoaded"; user: AuthenticatedUser; profile: Profile }
  | { type: "profileMissing" }
  | { type: "loadFailed"; message: string }
  | { type: "unauthorized" }
  | { type: "retry" };

export const initialAppState: MobileAppState = { status: "booting" };

function sessionFrom(state: MobileAppState): SessionSnapshot | null {
  return "session" in state ? state.session : null;
}

export function mobileAppReducer(
  state: MobileAppState,
  action: MobileAppAction,
): MobileAppState {
  switch (action.type) {
    case "sessionResolved":
      if (
        (state.status === "auth_link_loading" && state.kind === "recovery") ||
        state.status === "recovery"
      ) {
        return state;
      }
      if (action.session) {
        return { status: "loading_profile", session: action.session };
      }
      return state.status === "signed_out" ? state : { status: "signed_out", notice: null };
    case "authLinkStarted":
      return { status: "auth_link_loading", kind: action.kind };
    case "authLinkFailed":
      return { status: "auth_link_error", kind: action.kind, message: action.message };
    case "recoveryReady":
      return { status: "recovery", session: action.session };
    case "recoveryCompleted":
      return {
        status: "signed_out",
        notice: "Password updated. Sign in with your new password.",
        initialRoute: "SignIn",
      };
    case "requestRecoveryEmail":
      return { status: "signed_out", notice: null, initialRoute: "ForgotPassword" };
    case "profileLoaded": {
      const session = sessionFrom(state);
      return session
        ? { status: "authenticated", session, user: action.user, profile: action.profile }
        : state;
    }
    case "profileMissing": {
      const session = sessionFrom(state);
      return session ? { status: "profile_missing", session } : state;
    }
    case "loadFailed": {
      const session = sessionFrom(state);
      return session ? { status: "load_error", session, message: action.message } : state;
    }
    case "unauthorized":
      return { status: "signed_out", notice: "Your session expired. Sign in again." };
    case "retry": {
      const session = sessionFrom(state);
      return session ? { status: "loading_profile", session } : state;
    }
  }
}
