import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MobileApiError } from "./src/api";
import type { AuthenticatedUser, Profile, SessionSnapshot } from "./src/types";

jest.mock("react-native-safe-area-context", () => {
  const safeAreaMock = jest.requireActual<{ default: object }>(
    "react-native-safe-area-context/jest/mock",
  );
  return safeAreaMock.default;
});

const mockSession: SessionSnapshot = { access_token: "token", user: { id: "user-id" } };
const mockUser: AuthenticatedUser = { id: "user-id", email: "ada@example.com" };
const mockProfile: Profile = {
  id: "profile-id",
  user_id: mockUser.id,
  display_name: "Ada",
  current_level: "mid_level",
  target_role: "backend_engineer",
  preferred_stack: ["Python"],
  communication_goal: "technical_interviews",
  feedback_preference: "balanced",
  onboarding_completed: true,
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-02T12:00:00Z",
};

const mockApi = {
  getCurrentUser: jest.fn(),
  getProfile: jest.fn(),
  listConversations: jest.fn(),
  createGeneralConversation: jest.fn(),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  streamConversation: jest.fn(),
  retryMessage: jest.fn(),
};

const mockSignOut = jest.fn();
const mockClearMobileAuthSession = jest.fn();
const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetInitialURL = jest.fn();
const mockRemoveLinkListener = jest.fn();
let mockLinkHandler: ((event: { url: string }) => void) | null = null;
const mockLoadAuthenticatedProfile = jest.fn(async () => ({ user: mockUser, profile: mockProfile }));
const mockUnsubscribe = jest.fn();
let mockAuthStateHandler: ((event: string, session: SessionSnapshot | null) => void) | null = null;

jest.mock("./src/api", () => {
  const actual = jest.requireActual("./src/api");
  return { ...actual, createDevStrideApi: () => mockApi };
});

jest.mock("expo-linking", () => ({
  addEventListener: jest.fn((_event, handler) => {
    mockLinkHandler = handler;
    return { remove: mockRemoveLinkListener };
  }),
  getInitialURL: mockGetInitialURL,
}));

jest.mock("./src/load-profile", () => ({
  loadAuthenticatedProfile: mockLoadAuthenticatedProfile,
}));

jest.mock("./src/runtime-config", () => ({
  mobileConfig: { apiBaseUrl: "https://api.example.com" },
}));

jest.mock("./src/supabase", () => ({
  clearMobileAuthSession: mockClearMobileAuthSession,
  getAccessToken: jest.fn(),
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      exchangeCodeForSession: mockExchangeCodeForSession,
      onAuthStateChange: jest.fn((handler) => {
        mockAuthStateHandler = handler;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      }),
      signOut: mockSignOut,
      updateUser: mockUpdateUser,
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  },
}));

const App = require("./App").default as typeof import("./App").default;

describe("App authenticated integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.listConversations.mockResolvedValue([]);
    mockSignOut.mockResolvedValue({ error: null });
    mockClearMobileAuthSession.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockGetInitialURL.mockResolvedValue(null);
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    mockAuthStateHandler = null;
    mockLinkHandler = null;
  });

  it("mounts Conversations as the authenticated landing screen", async () => {
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Conversations" })).toBeOnTheScreen();
  });

  it("signs out locally and returns to sign-in when a child request is unauthorized", async () => {
    mockApi.listConversations.mockRejectedValue(
      new MobileApiError("unauthorized", "Your session expired. Sign in again.", 401),
    );
    await render(<App />);
    await waitFor(() => expect(mockClearMobileAuthSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeOnTheScreen();
  });

  it("validates a restored Supabase identity before loading the profile", async () => {
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Conversations" })).toBeOnTheScreen();
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it("waits for restored identity validation before requesting the profile", async () => {
    let resolveValidation: ((value: { data: { user: { id: string } }; error: null }) => void) | null =
      null;
    mockGetUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveValidation = resolve;
        }),
    );

    await render(<App />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalledTimes(1));
    expect(mockLoadAuthenticatedProfile).not.toHaveBeenCalled();

    await act(async () => {
      resolveValidation?.({ data: { user: { id: "user-id" } }, error: null });
    });
    expect(await screen.findByRole("header", { name: "Conversations" })).toBeOnTheScreen();
    expect(mockLoadAuthenticatedProfile).toHaveBeenCalledTimes(1);
  });

  it("preserves sign-in by validating a new authenticated session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeOnTheScreen();
    await act(async () => {
      mockAuthStateHandler?.("SIGNED_IN", mockSession);
    });
    expect(await screen.findByRole("header", { name: "Conversations" })).toBeOnTheScreen();
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it("clears an invalid restored session and returns to sign-in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    await render(<App />);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeOnTheScreen();
    expect(mockClearMobileAuthSession).toHaveBeenCalledTimes(1);
    expect(mockApi.getCurrentUser).not.toHaveBeenCalled();
  });

  it("keeps a restored session on temporary validation failure and offers retry", async () => {
    mockGetUser.mockRejectedValue(new TypeError("Network request failed"));
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Couldn’t load your profile" })).toBeOnTheScreen();
    expect(mockClearMobileAuthSession).not.toHaveBeenCalled();
    expect(screen.getByText("Try again")).toBeOnTheScreen();
  });

  it("handles a valid confirmation link at cold start before session restoration", async () => {
    mockGetInitialURL.mockResolvedValue(
      "devstride://auth/confirm?code=confirmation-code-123&sb_flow_id=abcdef1234567890",
    );
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Conversations" })).toBeOnTheScreen();
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("confirmation-code-123", {
      flowId: "abcdef1234567890",
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("routes a cold-start recovery link only to password recovery", async () => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    await render(<App />);
    expect(
      await screen.findByRole("header", { name: "Choose a new password" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Conversations" })).not.toBeOnTheScreen();
    expect(mockLoadAuthenticatedProfile).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("clears the recovery session before requesting another reset email", async () => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    await render(<App />);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Request another reset email" }),
    );
    expect(mockClearMobileAuthSession).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("header", { name: "Reset your password" }),
    ).toBeOnTheScreen();
  });

  it("ignores confirmation callbacks while recovery is active", async () => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    await render(<App />);
    expect(
      await screen.findByRole("header", { name: "Choose a new password" }),
    ).toBeOnTheScreen();
    await act(async () => {
      mockLinkHandler?.({ url: "devstride://auth/confirm?code=confirmation-code-456" });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("header", { name: "Choose a new password" })).toBeOnTheScreen();
    expect(mockLoadAuthenticatedProfile).not.toHaveBeenCalled();
  });

  it("queues recovery ahead of a pending confirmation without exposing authenticated UI", async () => {
    let resolveConfirmation: ((result: { data: { session: SessionSnapshot }; error: null }) => void) | null =
      null;
    mockGetInitialURL.mockResolvedValue("devstride://auth/confirm?code=confirmation-code-123");
    mockExchangeCodeForSession
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveConfirmation = resolve; }),
      )
      .mockResolvedValueOnce({ data: { session: mockSession }, error: null });
    await render(<App />);
    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockLinkHandler?.({ url: "devstride://auth/recovery?code=recovery-code-456" });
    });
    expect(screen.queryByRole("header", { name: "Conversations" })).not.toBeOnTheScreen();
    await act(async () => {
      resolveConfirmation?.({ data: { session: mockSession }, error: null });
    });
    expect(
      await screen.findByRole("header", { name: "Choose a new password" }),
    ).toBeOnTheScreen();
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(2);
    expect(mockLoadAuthenticatedProfile).not.toHaveBeenCalled();
  });

  it("handles a warm recovery event and ignores duplicate delivery", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Welcome back" })).toBeOnTheScreen();
    await act(async () => {
      mockLinkHandler?.({ url: "devstride://auth/recovery?code=recovery-code-123" });
    });
    expect(
      await screen.findByRole("header", { name: "Choose a new password" }),
    ).toBeOnTheScreen();
    await act(async () => {
      mockLinkHandler?.({ url: "devstride://auth/recovery?code=recovery-code-123" });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    "other://auth/confirm?code=confirmation-code-123",
    "devstride://other/confirm?code=confirmation-code-123",
    "devstride://auth/other?code=confirmation-code-123",
    "devstride://auth/confirm",
  ])("fails a malformed or unsupported cold-start auth URL safely: %s", async (url) => {
    mockGetInitialURL.mockResolvedValue(url);
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Link unavailable" })).toBeOnTheScreen();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockClearMobileAuthSession).not.toHaveBeenCalled();
    expect(mockLoadAuthenticatedProfile).not.toHaveBeenCalled();
  });

  it.each([
    "devstride://auth/confirm",
    "devstride://auth/recovery",
  ])("accepts a valid recovery callback after an invalid callback: %s", async (invalidUrl) => {
    mockGetInitialURL.mockResolvedValue(invalidUrl);
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Link unavailable" })).toBeOnTheScreen();
    await act(async () => {
      mockLinkHandler?.({ url: "devstride://auth/recovery?code=recovery-code-456" });
    });
    expect(
      await screen.findByRole("header", { name: "Choose a new password" }),
    ).toBeOnTheScreen();
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockClearMobileAuthSession).not.toHaveBeenCalled();
  });

  it("opens a fresh recovery request from a failed recovery callback", async () => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery");
    await render(<App />);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Request another email" }),
    );
    expect(
      await screen.findByRole("header", { name: "Reset your password" }),
    ).toBeOnTheScreen();
  });

  it.each([
    { code: "flow_state_expired" },
    { name: "AuthPKCECodeVerifierMissingError" },
  ])("shows a safe recovery error for an expired or wrong-device exchange", async (error) => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error });
    await render(<App />);
    expect(await screen.findByRole("header", { name: "Link unavailable" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Request another email" })).toBeOnTheScreen();
    expect(mockClearMobileAuthSession).toHaveBeenCalledTimes(1);
    expect(mockLoadAuthenticatedProfile).not.toHaveBeenCalled();
  });

  it("never exposes normal authenticated UI while a recovery exchange is pending", async () => {
    let resolveExchange: ((result: { data: { session: SessionSnapshot }; error: null }) => void) | null =
      null;
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    mockExchangeCodeForSession.mockImplementation(
      () => new Promise((resolve) => { resolveExchange = resolve; }),
    );
    await render(<App />);
    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1));
    await act(async () => {
      mockAuthStateHandler?.("SIGNED_IN", mockSession);
    });
    expect(screen.queryByRole("header", { name: "Conversations" })).not.toBeOnTheScreen();
    await act(async () => {
      resolveExchange?.({ data: { session: mockSession }, error: null });
    });
    expect(
      await screen.findByRole("header", { name: "Choose a new password" }),
    ).toBeOnTheScreen();
  });

  it("clears the recovery session and requires normal sign-in after password update", async () => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    await render(<App />);
    await fireEvent.changeText(await screen.findByLabelText("New password"), "new-password");
    await fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password");
    await fireEvent.press(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByText("Password updated. Sign in with your new password.")).toBeOnTheScreen();
    expect(mockClearMobileAuthSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("header", { name: "Welcome back" })).toBeOnTheScreen();
  });

  it("does not report recovery success when local session cleanup fails", async () => {
    mockGetInitialURL.mockResolvedValue("devstride://auth/recovery?code=recovery-code-123");
    mockClearMobileAuthSession.mockResolvedValue({ name: "SecureStoreError" });
    await render(<App />);
    await fireEvent.changeText(await screen.findByLabelText("New password"), "new-password");
    await fireEvent.changeText(screen.getByLabelText("Confirm new password"), "new-password");
    await fireEvent.press(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("header", { name: "Link unavailable" })).toBeOnTheScreen();
    expect(screen.getByText(/could not clear the recovery session/i)).toBeOnTheScreen();
    expect(screen.queryByText("Password updated. Sign in with your new password.")).not.toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Conversations" })).not.toBeOnTheScreen();
  });

});
