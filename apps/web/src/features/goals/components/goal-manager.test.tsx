import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GoalManager } from "./goal-manager";

const { previewPlan, createGoal, listGoals, archiveGoal } = vi.hoisted(() => ({ previewPlan: vi.fn(), createGoal: vi.fn(), listGoals: vi.fn(), archiveGoal: vi.fn() }));
vi.mock("../api", () => ({ previewPlan, createGoal, listGoals, archiveGoal, updateGoal: vi.fn(), updateFocusArea: vi.fn(), archiveFocusArea: vi.fn(), reorderFocusAreas: vi.fn(), launchFocusAreaPractice: vi.fn() }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("GoalManager", () => {
  beforeEach(() => { previewPlan.mockReset(); createGoal.mockReset(); listGoals.mockReset(); archiveGoal.mockReset(); });

  it("explains Profile versus Goal before creation", () => {
    render(<GoalManager initialGoals={[]} initialProgress={null} />);
    expect(screen.getByText(/Profile tells DevStride who you are/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create a goal" }));
    expect(screen.getByRole("heading", { name: "Create a goal" })).toBeInTheDocument();
  });

  it("previews deterministic suggestions and keeps saved context optional", async () => {
    previewPlan.mockResolvedValue({ heading: "Suggested focus areas", basis: "Based on your Goal and Profile", goal_draft: { title: "API growth", description: null, goal_type: "technical_growth" }, template_suggestions: [{ title: "APIs", description: "Practice API design", suggested_position: 0, source: "template", reason: "Aligned to your goal.", practice_mode: "mentor", practice_config: {} }], memory_suggestions: [{ title: "Saved API context", description: "A saved note", suggested_position: 1, source: "memory", reason: "Saved context suggestion.", practice_mode: "mentor", practice_config: {} }] });
    render(<GoalManager initialGoals={[]} initialProgress={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Create a goal" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Goal title"), { target: { value: "API growth" } });
    fireEvent.click(screen.getByRole("button", { name: "Suggest a plan" }));
    await waitFor(() => expect(screen.getByText("Suggested by DevStride")).toBeInTheDocument());
    expect(screen.getByText("Saved context suggestions")).toBeInTheDocument();
    expect(screen.getByText("Saved API context")).toBeInTheDocument();
  });

  it("moves an archived goal to history and removes its active practice action", async () => {
    const focus = { id: "focus-1", goal_id: "goal-1", title: "APIs", description: "Practice APIs", practice_mode: "mentor" as const, practice_config: {}, position: 0, status: "active" as const, completed_at: null, created_at: "", updated_at: "" };
    const activeGoal = { id: "goal-1", title: "Backend depth", description: "Build confidence", goal_type: "technical_growth" as const, status: "active" as const, completed_at: null, created_at: "", updated_at: "", focus_areas: [focus], evidence: ["You saved this focus area."], action: { kind: "start_practice" as const, mode: "mentor" as const, conversation_id: null, goal_id: "goal-1", focus_area_id: "focus-1", interview_type: null, interview_focus: null, team_scenario: null, team_difficulty: null } };
    const archivedGoal = { ...activeGoal, status: "archived" as const, focus_areas: [{ ...focus, status: "archived" as const }] };
    listGoals.mockResolvedValue([archivedGoal]);
    archiveGoal.mockResolvedValue(undefined);
    render(<GoalManager initialGoals={[activeGoal]} initialProgress={null} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Archive goal" }));

    await waitFor(() => expect(screen.getByText("Archived · read-only · 1 focus areas")).toBeInTheDocument());
    expect(screen.queryByText("Active goal · Technical growth")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start practice" })).not.toBeInTheDocument();
    expect(listGoals).toHaveBeenCalledTimes(1);
  });
});
