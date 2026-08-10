import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it } from "vitest";

import { ProgressEmptyState, ProgressOverview } from "./progress-overview";

const summary = {
  total_sessions: 3,
  mentor_sessions: 1,
  interview_sessions: 1,
  general_sessions: 1,
  team_sessions: 0,
  recent_sessions: [
    {
      id: "interview-id",
      title: "Technical Interview — Databases",
      mode: "interview" as const,
      interview_type: "technical",
      interview_focus: "databases",
      team_scenario: null,
      updated_at: "2026-08-10T10:00:00Z",
      message_count: 4,
      has_messages: true,
      interview_started: true,
      interview_completed: true,
      has_final_assessment: true,
      summary_available: true,
    },
  ],
};

describe("ProgressOverview", () => {
  it("renders trustworthy counts, context, status, and conversation links", () => {
    render(<ProgressOverview summary={summary} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Mentor sessions")).toBeInTheDocument();
    expect(screen.getByText("Technical interview · Databases · 4 messages")).toBeInTheDocument();
    expect(screen.getByText("Final assessment available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Technical Interview/ })).toHaveAttribute("href", "/conversations/interview-id");
    expect(screen.getByRole("link", { name: "View summary" })).toHaveAttribute("href", "/conversations/interview-id#session-summary");
  });

  it("offers useful actions for an empty history", () => {
    render(<ProgressEmptyState />);

    expect(screen.getByRole("heading", { name: "No practice history yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Mentor Mode" })).toHaveAttribute("href", "/dashboard#mentor-practice");
    expect(screen.getByRole("link", { name: "Start Mock Interview" })).toHaveAttribute("href", "/dashboard#interview-practice");
  });
});
