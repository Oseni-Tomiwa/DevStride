import { fireEvent, render, screen } from "@testing-library/react-native";

import type { DevStrideApi } from "../api";
import { lightAppColors } from "../theme";
import type { AuthenticatedUser, Profile } from "../types";
import { AuthenticatedNavigator } from "./AuthenticatedNavigator";

const user: AuthenticatedUser = { id: "user-id", email: "ada@example.com" };
const profile: Profile = {
  id: "profile-id",
  user_id: user.id,
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

function createApi(): DevStrideApi {
  return {
    getCurrentUser: jest.fn(),
    getProfile: jest.fn(),
    listConversations: jest.fn().mockResolvedValue([]),
    createGeneralConversation: jest.fn(),
    getConversation: jest.fn(),
    listMessages: jest.fn(),
    streamConversation: jest.fn(),
    retryMessage: jest.fn(),
  };
}

describe("AuthenticatedNavigator", () => {
  it("lands on Conversations and opens the existing Profile screen", async () => {
    await render(
      <AuthenticatedNavigator
        api={createApi()}
        colors={lightAppColors}
        onSignOut={jest.fn()}
        onUnauthorized={jest.fn()}
        profile={profile}
        user={user}
      />,
    );
    expect(await screen.findByRole("header", { name: "Conversations" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Open profile" }));
    expect(await screen.findByRole("header", { name: "Ada" })).toBeOnTheScreen();
  });

  it("preserves the Profile sign-out action", async () => {
    const onSignOut = jest.fn().mockResolvedValue(null);
    await render(
      <AuthenticatedNavigator
        api={createApi()}
        colors={lightAppColors}
        onSignOut={onSignOut}
        onUnauthorized={jest.fn()}
        profile={profile}
        user={user}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Open profile" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
