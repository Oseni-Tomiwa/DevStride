import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api/client";
import ProfilePage from "./page";

const { getAuthenticatedProfile, getUser, redirect } = vi.hoisted(() => ({
  getAuthenticatedProfile: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("../../features/profile/api", () => ({ getAuthenticatedProfile }));

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { email: "ada@example.com" } } });
    getAuthenticatedProfile.mockResolvedValue({
      display_name: "Ada",
      current_level: "senior",
      target_role: "backend_engineer",
      preferred_stack: ["Python", "PostgreSQL"],
      communication_goal: "technical_interviews",
      feedback_preference: "balanced",
    });
  });

  it("renders the existing profile editor with persisted values", async () => {
    render(await ProfilePage());

    expect(screen.getByRole("heading", { name: "Your coaching profile." })).toBeInTheDocument();
    expect(screen.getByText("Who you are, where you’re heading, and how DevStride should tailor practice.")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Preferred stack")).toHaveValue("Python, PostgreSQL");
    const navigation = screen.getByRole("navigation", { name: "Authenticated navigation" });
    expect(within(navigation).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("redirects unauthenticated users to login", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });

    await expect(ProfilePage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects authenticated users without a profile to onboarding", async () => {
    getAuthenticatedProfile.mockRejectedValueOnce(new ApiError("Profile not found", 404));

    await expect(ProfilePage()).rejects.toThrow("REDIRECT:/onboarding");
  });
});
