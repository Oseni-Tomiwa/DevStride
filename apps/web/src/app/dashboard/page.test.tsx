import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const profile = {
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
};

const progress = {
  total_sessions: 7,
  mentor_sessions: 2,
  interview_sessions: 2,
  general_sessions: 2,
  team_sessions: 1,
  recent_sessions: [],
  activity: {
    practiced_sessions: 3,
    completed_sessions: 1,
    user_turns: 8,
    practiced_sessions_last_30_days: 2,
    mode_breakdown: { general: 1, mentor: 1, interview: 1, team: 0 },
  },
  continue_practice: {
    conversation_id: "continue-id",
    title: "Technical Interview — APIs",
    mode: "interview",
    last_activity_at: "2026-08-10T10:00:00Z",
    interview_type: "technical",
    interview_focus: "apis",
    team_scenario: null,
  },
  current_focus: { basis: "saved_goal", label: "Prepare concise backend explanations" },
  recent_strength: {
    text: "Clear API examples",
    occurrences: 1,
    latest_at: "2026-08-10T10:00:00Z",
    modes: ["mentor"],
    conversation_id: "strength-id",
  },
  recent_weakness: {
    text: "State trade-offs earlier",
    occurrences: 1,
    latest_at: "2026-08-09T10:00:00Z",
    modes: ["interview"],
    conversation_id: "weakness-id",
  },
  recurring_strengths: [],
  recurring_weaknesses: [],
  rating_history: [],
  recommendation: {
    activity: "continue",
    title: "Continue your API interview",
    reason: "You started this structured practice recently and have not completed it.",
    evidence: ["Your latest user turn was within the last 14 days."],
    action: {
      kind: "continue_conversation",
      mode: "interview",
      conversation_id: "continue-id",
      interview_type: null,
      interview_focus: null,
      team_scenario: null,
    },
  },
};

describe("DashboardPage", () => {
  beforeEach(() => {
    get.mockReset();
    createConversation.mockReset();
    redirect.mockClear();
  });

  it("renders profile, recommendation, activity, evidence, and every practice entry point", async () => {
    get.mockResolvedValueOnce(profile).mockResolvedValueOnce(progress);

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
    expect(screen.getByText("Senior")).toBeInTheDocument();
    expect(screen.getByText("Python, PostgreSQL")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Continue your API interview" })).toBeInTheDocument();
    expect(screen.getByText(progress.recommendation.reason)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue practice" })).toHaveAttribute("href", "/conversations/continue-id");
    expect(screen.getByText("Practiced sessions")).toBeInTheDocument();
    expect(screen.getByText("Prepare concise backend explanations")).toBeInTheDocument();
    expect(screen.getByText("Clear API examples")).toBeInTheDocument();
    expect(screen.getByText("State trade-offs earlier")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mentor Mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Text Mentor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Team Practice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Interview Mode" })).toBeInTheDocument();
  });

  it("shows a profile-aligned starter recommendation with truthful zero activity", async () => {
    get.mockResolvedValueOnce(profile).mockResolvedValueOnce({
      ...progress,
      total_sessions: 0,
      activity: {
        practiced_sessions: 0,
        completed_sessions: 0,
        user_turns: 0,
        practiced_sessions_last_30_days: 0,
        mode_breakdown: { general: 0, mentor: 0, interview: 0, team: 0 },
      },
      continue_practice: null,
      current_focus: { basis: "communication_goal", label: "Technical interview practice" },
      recent_strength: null,
      recent_weakness: null,
      recommendation: {
        activity: "interview",
        title: "Start profile-aligned practice",
        reason: "Your communication goal is technical interview practice.",
        evidence: ["This starter recommendation uses your editable Profile."],
        action: {
          kind: "start_practice",
          mode: "interview",
          conversation_id: null,
          interview_type: "technical",
          interview_focus: null,
          team_scenario: null,
        },
      },
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Start profile-aligned practice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Interview Mode" })).toHaveAttribute("href", "/dashboard#interview-practice");
    expect(screen.queryByText("Recent strength")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent area to improve")).not.toBeInTheDocument();
  });

  it("shows the active Goal summary when Goal progress is available", async () => {
    get.mockResolvedValueOnce(profile).mockResolvedValueOnce({
      ...progress,
      goal_progress: {
        goal_id: "goal-1",
        title: "Backend depth",
        status: "active",
        total_focus_areas: 2,
        active_focus_areas: 2,
        completed_focus_areas: 1,
        archived_focus_areas: 0,
        linked_practiced_sessions: 1,
        linked_completed_structured_sessions: 0,
        linked_user_turns: 2,
        linked_practice_last_30_days: 1,
        current_focus: { basis: "goal_focus_area", label: "APIs", goal_id: "goal-1", focus_area_id: "focus-1" },
        focus_areas: [],
        latest_linked_practice: null,
        recent_strength: null,
        recent_weakness: null,
        recurring_strengths: [],
        recurring_weaknesses: [],
        rating_history: [],
        next_action: {
          activity: "mentor",
          title: "Practice APIs",
          reason: "This is your current focus.",
          focus_area_id: "focus-1",
          evidence: [],
          action: { kind: "start_practice", mode: "mentor", conversation_id: null, goal_id: "goal-1", focus_area_id: "focus-1", interview_type: null, interview_focus: null, team_scenario: null, team_difficulty: null },
        },
      },
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Backend depth" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Goal" })).toHaveAttribute("href", "/goals");
  });

  it("starts Mentor Mode from the dashboard", async () => {
    get.mockResolvedValueOnce({ ...profile, preferred_stack: ["Python"] }).mockResolvedValueOnce(progress);
    createConversation.mockReturnValueOnce(new Promise(() => {}));

    render(await DashboardPage());
    fireEvent.click(screen.getByRole("button", { name: "Start Text Mentor" }));
    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      { title: "Mentor session", mode: "mentor" },
    ));
  });

  it("starts Live Mentor with explicit voice transport", async () => {
    get.mockResolvedValueOnce({ ...profile, preferred_stack: ["Python"] }).mockResolvedValueOnce(progress);
    createConversation.mockResolvedValueOnce({ id: "mentor-live-id" });

    render(await DashboardPage());
    fireEvent.click(screen.getByLabelText(/Live Mentor/));
    fireEvent.click(screen.getByRole("button", { name: "Start Live Mentor" }));
    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      { title: "Mentor session", mode: "mentor", mentor_transport: "live_voice" },
    ));
  });

  it("redirects authenticated users without a profile to onboarding", async () => {
    get.mockRejectedValueOnce(new ApiError("Profile not found", 404));

    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/onboarding");
    expect(get).toHaveBeenCalledWith("/api/v1/profile/me");
  });
});
