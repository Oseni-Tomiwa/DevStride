import type { AuthenticatedUser, Profile, SessionSnapshot } from "./types";

export type MobileAppState =
  | { status: "booting" }
  | { status: "signed_out"; notice: string | null }
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
      if (action.session) {
        return { status: "loading_profile", session: action.session };
      }
      return state.status === "signed_out" ? state : { status: "signed_out", notice: null };
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
