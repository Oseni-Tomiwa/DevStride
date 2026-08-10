import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api/client";
import DashboardPage from "./page";

const get = vi.fn();
const { createConversation, redirect } = vi.hoisted(() => ({
  createConversation: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: "user@example.com" } } }) },
  }),
}));

vi.mock("../../lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createAuthenticatedApiClient: () => ({ get }),
}));
vi.mock("../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../../features/conversations/api", () => ({ createConversation }));

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("DashboardPage", () => {
  it("renders personalized profile data and practice cards", async () => {
    get.mockResolvedValueOnce({
      id: "profile-id",
      user_id: "user-id",
      display_name: "Ada",
      current_level: "senior",
      target_role: "backend_engineer",
      preferred_stack: ["Python", "PostgreSQL"],
      communication_goal: "technical_interviews",
      feedback_preference: "balanced",
      onboarding_completed: true,
      created_at: "",
      updated_at: "",
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
    expect(screen.getByText("Senior")).toBeInTheDocument();
    expect(screen.getByText("Python, PostgreSQL")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Learn with Mentor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Mentor Mode" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Coming soon" })).toHaveLength(2);
  });

  it("starts Mentor Mode from the dashboard", async () => {
    get.mockResolvedValueOnce({
      id: "profile-id",
      user_id: "user-id",
      display_name: "Ada",
      current_level: "senior",
      target_role: "backend_engineer",
      preferred_stack: ["Python"],
      communication_goal: "technical_interviews",
      feedback_preference: "balanced",
      onboarding_completed: true,
      created_at: "",
      updated_at: "",
    });
    createConversation.mockReturnValueOnce(new Promise(() => {}));

    render(await DashboardPage());
    fireEvent.click(screen.getByRole("button", { name: "Start Mentor Mode" }));
    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      { title: "Mentor session", mode: "mentor" },
    ));
  });

  it("redirects authenticated users without a profile to onboarding", async () => {
    get.mockRejectedValueOnce(new ApiError("Profile not found", 404));

    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/onboarding");
    expect(get).toHaveBeenCalledWith("/api/v1/profile/me");
  });
});
