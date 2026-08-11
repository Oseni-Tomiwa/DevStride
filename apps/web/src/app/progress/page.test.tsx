import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProgressPage from "./page";

const { getProgressSummary, getUser, redirect } = vi.hoisted(() => ({
  getProgressSummary: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("../../features/progress/api", () => ({ getProgressSummary }));
vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const emptyProgress = {
  total_sessions: 0,
  mentor_sessions: 0,
  interview_sessions: 0,
  general_sessions: 0,
  team_sessions: 0,
  recent_sessions: [],
  activity: {
    practiced_sessions: 0,
    completed_sessions: 0,
    user_turns: 0,
    practiced_sessions_last_30_days: 0,
    mode_breakdown: { general: 0, mentor: 0, interview: 0, team: 0 },
  },
  continue_practice: null,
  current_focus: null,
  recent_strength: null,
  recent_weakness: null,
  recurring_strengths: [],
  recurring_weaknesses: [],
  rating_history: [],
  recommendation: {
    activity: "mentor",
    title: "Start with Mentor practice",
    reason: "Build your first evidence-backed practice record with a focused Mentor session.",
    evidence: ["No completed practice evidence is available yet."],
    action: {
      kind: "start_practice",
      mode: "mentor",
      conversation_id: null,
      interview_type: null,
      interview_focus: null,
      team_scenario: null,
    },
  },
};

describe("ProgressPage", () => {
  beforeEach(() => {
    getProgressSummary.mockReset();
    getUser.mockReset();
    redirect.mockClear();
  });

  it("keeps the route protected", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(ProgressPage()).rejects.toThrow("REDIRECT:/login");
    expect(getProgressSummary).not.toHaveBeenCalled();
  });

  it("renders the backend starter recommendation and truthful empty state for a new user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-id" } } });
    getProgressSummary.mockResolvedValue(emptyProgress);

    render(await ProgressPage());

    expect(screen.getByRole("heading", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start with Mentor practice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No practice history yet" })).toBeInTheDocument();
    expect(screen.getByText("Practiced sessions")).toBeInTheDocument();
  });
});
