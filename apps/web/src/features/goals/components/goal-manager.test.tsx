import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GoalManager } from "./goal-manager";

const { previewPlan, createGoal } = vi.hoisted(() => ({ previewPlan: vi.fn(), createGoal: vi.fn() }));
vi.mock("../api", () => ({ previewPlan, createGoal, updateGoal: vi.fn(), archiveGoal: vi.fn(), updateFocusArea: vi.fn(), archiveFocusArea: vi.fn(), reorderFocusAreas: vi.fn(), launchFocusAreaPractice: vi.fn() }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("GoalManager", () => {
  beforeEach(() => { previewPlan.mockReset(); createGoal.mockReset(); });

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
});
