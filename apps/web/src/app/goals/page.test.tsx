import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GoalsPage from "./page";

const { listGoals, getGoalProgress, redirect } = vi.hoisted(() => ({
  listGoals: vi.fn(),
  getGoalProgress: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("../../lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-id" } } }) } }) }));
vi.mock("../../features/goals/api", () => ({ listGoals, getGoalProgress }));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../lib/supabase/client", () => ({ createClient: () => ({}) }));

describe("GoalsPage", () => {
  beforeEach(() => { listGoals.mockReset(); getGoalProgress.mockReset(); redirect.mockClear(); });

  it("renders the empty goal state and creation CTA", async () => {
    listGoals.mockResolvedValue([]);
    render(await GoalsPage());
    expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(screen.getByText(/Profile tells DevStride who you are/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a goal" })).toBeInTheDocument();
  });

  it("renders an active goal with evidence-backed progress", async () => {
    listGoals.mockResolvedValue([{ id: "goal-1", title: "Backend depth", description: "Build confidence", goal_type: "technical_growth", status: "active", completed_at: null, created_at: "", updated_at: "", focus_areas: [{ id: "focus-1", goal_id: "goal-1", title: "APIs", description: "Practice APIs", practice_mode: "mentor", practice_config: {}, position: 0, status: "active", completed_at: null, created_at: "", updated_at: "" }], evidence: ["You saved this focus area."], action: { kind: "start_practice", mode: "mentor", conversation_id: null, goal_id: "goal-1", focus_area_id: "focus-1", interview_type: null, interview_focus: null, team_scenario: null, team_difficulty: null } }]);
    getGoalProgress.mockResolvedValue({ goal_id: "goal-1", title: "Backend depth", status: "active", total_focus_areas: 1, active_focus_areas: 1, completed_focus_areas: 0, archived_focus_areas: 0, linked_practiced_sessions: 0, linked_completed_structured_sessions: 0, linked_user_turns: 0, linked_practice_last_30_days: 0, current_focus: { basis: "goal_focus_area", label: "APIs", goal_id: "goal-1", focus_area_id: "focus-1" }, focus_areas: [{ focus_area_id: "focus-1", title: "APIs", practice_mode: "mentor", status: "active", linked_practiced_sessions: 0, linked_user_turns: 0, latest_practice_at: null, latest_summary_available: false, recent_strength: null, recent_weakness: null }], latest_linked_practice: null, recent_strength: null, recent_weakness: null, recurring_strengths: [], recurring_weaknesses: [], rating_history: [], next_action: { activity: "mentor", title: "Practice APIs", reason: "This is your current focus.", focus_area_id: "focus-1", evidence: [], action: { kind: "start_practice", mode: "mentor", conversation_id: null, goal_id: "goal-1", focus_area_id: "focus-1", interview_type: null, interview_focus: null, team_scenario: null, team_difficulty: null } } });
    render(await GoalsPage());
    expect(screen.getByRole("heading", { name: "Backend depth" })).toBeInTheDocument();
    expect(screen.getByText("0 of 1 focus areas marked complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start practice" })).toBeInTheDocument();
  });
});
