import { render, screen, waitFor } from "@testing-library/react-native";

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
const mockUnsubscribe = jest.fn();

jest.mock("./src/api", () => {
  const actual = jest.requireActual("./src/api");
  return { ...actual, createDevStrideApi: () => mockApi };
});

jest.mock("./src/load-profile", () => ({
  loadAuthenticatedProfile: jest.fn(async () => ({ user: mockUser, profile: mockProfile })),
}));

jest.mock("./src/runtime-config", () => ({
  mobileConfig: { apiBaseUrl: "https://api.example.com" },
}));

jest.mock("./src/supabase", () => ({
  getAccessToken: jest.fn(),
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: mockUnsubscribe } } })),
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
    await waitFor(() =>
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" }),
    );
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeOnTheScreen();
  });
});
