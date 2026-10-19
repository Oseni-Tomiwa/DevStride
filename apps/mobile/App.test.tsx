import { act, render, screen, waitFor } from "@testing-library/react-native";

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
const mockLoadAuthenticatedProfile = jest.fn(async () => ({ user: mockUser, profile: mockProfile }));
const mockUnsubscribe = jest.fn();
let mockAuthStateHandler: ((event: string, session: SessionSnapshot | null) => void) | null = null;

jest.mock("./src/api", () => {
  const actual = jest.requireActual("./src/api");
  return { ...actual, createDevStrideApi: () => mockApi };
});

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
      onAuthStateChange: jest.fn((handler) => {
        mockAuthStateHandler = handler;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      }),
      signOut: mockSignOut,
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
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    mockAuthStateHandler = null;
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

});
