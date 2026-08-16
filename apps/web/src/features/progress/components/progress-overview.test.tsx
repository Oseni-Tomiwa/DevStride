import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it } from "vitest";

import type { ProgressSummary } from "../types";
import { ProgressOverview } from "./progress-overview";

const baseSummary: ProgressSummary = {
  // Deliberately different from practiced_sessions to protect the semantic boundary.
  total_sessions: 9,
  mentor_sessions: 3,
  interview_sessions: 2,
  general_sessions: 3,
  team_sessions: 1,
  activity: {
    practiced_sessions: 4,
    completed_sessions: 2,
    user_turns: 11,
    practiced_sessions_last_30_days: 3,
    mode_breakdown: { general: 1, mentor: 1, interview: 1, team: 1 },
  },
  continue_practice: {
    conversation_id: "mentor-continue",
    title: "Mentor Session",
    mode: "mentor",
    last_activity_at: "2026-08-10T11:00:00Z",
    interview_type: null,
    interview_focus: null,
    team_scenario: null,
  },
  current_focus: { basis: "saved_goal", label: "Explain system trade-offs clearly" },
  recent_strength: {
    text: "Structured API explanations",
    occurrences: 1,
    latest_at: "2026-08-10T10:00:00Z",
    modes: ["mentor"],
    conversation_id: "strength-source",
  },
  recent_weakness: {
    text: "State assumptions before choosing a design",
    occurrences: 1,
    latest_at: "2026-08-09T10:00:00Z",
    modes: ["interview"],
    conversation_id: "weakness-source",
  },
  recurring_strengths: [{
    text: "Clear trade-off analysis",
    occurrences: 3,
    latest_at: "2026-08-08T10:00:00Z",
    modes: ["mentor", "interview"],
    conversation_id: "recurring-strength",
  }],
  recurring_weaknesses: [{
    text: "Quantify operational impact",
    occurrences: 2,
    latest_at: "2026-08-07T10:00:00Z",
    modes: ["interview", "team"],
    conversation_id: "recurring-weakness",
  }],
  rating_history: [
    {
      conversation_id: "rating-1",
      observed_at: "2026-08-01T10:00:00Z",
      interview_type: "technical",
      interview_focus: "databases",
      correctness: 2,
      clarity: 3,
      depth: 2,
      reasoning: 3,
    },
    {
      conversation_id: "rating-2",
      observed_at: "2026-08-08T10:00:00Z",
      interview_type: "technical",
      interview_focus: "databases",
      correctness: 3,
      clarity: 4,
      depth: 3,
      reasoning: 4,
    },
    {
      conversation_id: "rating-behavioral",
      observed_at: "2026-08-09T10:00:00Z",
      interview_type: "behavioral",
      interview_focus: null,
      correctness: null,
      clarity: 3,
      depth: null,
      reasoning: 3,
    },
  ],
  recommendation: {
    activity: "continue",
    title: "Continue Mentor Session",
    reason: "You started this structured practice recently and have not completed it.",
    evidence: ["Your latest user turn was within the last 14 days."],
    action: {
      kind: "continue_conversation",
      mode: "mentor",
      conversation_id: "mentor-continue",
      interview_type: null,
      interview_focus: null,
      team_scenario: null,
    },
  },
  recent_sessions: [
    {
      id: "interview-id",
      title: "Technical Interview — Databases",
      mode: "interview",
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
      user_turns: 2,
      practiced: true,
      structured_completed: true,
    },
    {
      id: "mentor-id",
      title: "Mentor Session",
      mode: "mentor",
      interview_type: null,
      interview_focus: null,
      team_scenario: null,
      updated_at: "2026-08-09T10:00:00Z",
      message_count: 2,
      has_messages: true,
      interview_started: false,
      interview_completed: false,
      has_final_assessment: false,
      summary_available: false,
      user_turns: 1,
      practiced: true,
      structured_completed: false,
    },
  ],
};

function summaryWith(overrides: Partial<ProgressSummary>): ProgressSummary {
  return { ...baseSummary, ...overrides };
}

describe("ProgressOverview", () => {
  it("uses activity semantics for overview metrics and renders the mode breakdown", () => {
    render(<ProgressOverview summary={baseSummary} />);

    const metrics = screen.getByLabelText("Practice activity metrics");
    expect(within(metrics).getByText("4")).toBeInTheDocument();
    expect(within(metrics).getByText("Practiced sessions")).toBeInTheDocument();
    expect(within(metrics).queryByText("9")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Practice by mode" })).toBeInTheDocument();
    expect(screen.getByText("Completed structured sessions")).toBeInTheDocument();
  });

  it("places the next-practice recommendation before secondary activity detail", () => {
    render(<ProgressOverview summary={baseSummary} />);

    const recommendation = screen.getByRole("heading", { name: baseSummary.recommendation.title });
    const activity = screen.getByRole("heading", { name: "Practice activity" });
    expect(recommendation.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders recommendation reason, safe evidence, action, and continue practice", () => {
    render(<ProgressOverview summary={baseSummary} compact />);

    expect(screen.getByRole("heading", { name: "Continue Mentor Session" })).toBeInTheDocument();
    expect(screen.getByText(baseSummary.recommendation.reason)).toBeInTheDocument();
    expect(screen.getByText("Your latest user turn was within the last 14 days.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Continue/ })[0]).toHaveAttribute("href", "/conversations/mentor-continue");
    expect(screen.getByRole("heading", { name: "Mentor Session" })).toBeInTheDocument();
  });

  it("shows canonical Goal and active Focus context beside the recommendation", () => {
    render(<ProgressOverview summary={summaryWith({
      goal_progress: {
        goal_id: "goal-1",
        title: "Backend depth",
        status: "active",
        total_focus_areas: 1,
        active_focus_areas: 1,
        completed_focus_areas: 0,
        archived_focus_areas: 0,
        linked_practiced_sessions: 0,
        linked_completed_structured_sessions: 0,
        linked_user_turns: 0,
        linked_practice_last_30_days: 0,
        current_focus: null,
        focus_areas: [{
          focus_area_id: "focus-1",
          title: "Database indexing",
          practice_mode: "mentor",
          status: "active",
          linked_practiced_sessions: 0,
          linked_user_turns: 0,
          latest_practice_at: null,
          latest_summary_available: false,
          recent_strength: null,
          recent_weakness: null,
        }],
        latest_linked_practice: null,
        recent_strength: null,
        recent_weakness: null,
        recurring_strengths: [],
        recurring_weaknesses: [],
        rating_history: [],
        next_action: {
          activity: "mentor",
          title: "Practice database indexing",
          reason: "This focus has not been practiced yet.",
          focus_area_id: "focus-1",
          evidence: [],
          action: {
            kind: "start_practice",
            mode: "mentor",
            conversation_id: null,
            goal_id: "goal-1",
            focus_area_id: "focus-1",
            interview_type: null,
            interview_focus: null,
            team_scenario: null,
            team_difficulty: null,
          },
        },
      },
      recommendation: {
        ...baseSummary.recommendation,
        activity: "mentor",
        title: "Practice database indexing",
        reason: "This focus has not been practiced yet.",
        action: {
          ...baseSummary.recommendation.action,
          kind: "start_practice",
          mode: "mentor",
          goal_id: "goal-1",
          focus_area_id: "focus-1",
          conversation_id: null,
        },
      },
    })} />);

    expect(screen.getAllByText("Backend depth")).toHaveLength(2);
    expect(screen.getByText("Database indexing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Goal" })).toHaveAttribute("href", "/goals");
  });

  it("omits the continue card when the backend returns null", () => {
    render(<ProgressOverview summary={summaryWith({ continue_practice: null })} compact />);

    expect(screen.queryByText("Continue practice", { selector: ".eyebrow" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Continue Mentor Session" })).toBeInTheDocument();
  });

  it.each([
    ["mentor", "Start Mentor Mode", "/dashboard#mentor-practice"],
    ["interview", "Start Interview Mode", "/dashboard#interview-practice"],
    ["team", "Start Team Practice", "/dashboard#team-practice"],
  ] as const)("routes a %s recommendation to its existing safe entry point", (mode, label, href) => {
    render(<ProgressOverview summary={summaryWith({
      continue_practice: null,
      recommendation: {
        ...baseSummary.recommendation,
        activity: mode,
        action: {
          ...baseSummary.recommendation.action,
          kind: "start_practice",
          mode,
          conversation_id: null,
        },
      },
    })} compact />);

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it("renders current, recent, and recurring evidence with counts and source links", () => {
    render(<ProgressOverview summary={baseSummary} />);

    expect(screen.getByText("Explain system trade-offs clearly")).toBeInTheDocument();
    expect(screen.getByText("Structured API explanations")).toBeInTheDocument();
    expect(screen.getByText("State assumptions before choosing a design")).toBeInTheDocument();
    expect(screen.getByText("Clear trade-off analysis")).toBeInTheDocument();
    expect(screen.getByText("3 observations · Latest Aug 8, 2026")).toBeInTheDocument();
    expect(screen.getByText("Quantify operational impact")).toBeInTheDocument();
    expect(screen.getByText("2 observations · Latest Aug 7, 2026")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View supporting session" }).map((link) => link.getAttribute("href"))).toContain("/conversations/recurring-weakness");
  });

  it("renders compatible rating groups with cautious wording", () => {
    render(<ProgressOverview summary={baseSummary} />);

    expect(screen.getByRole("heading", { name: "Recorded rating history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Databases interviews" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Behavioral interviews" })).toBeInTheDocument();
    expect(screen.getAllByText("Latest recorded rating")).toHaveLength(2);
    expect(screen.getByText(/not proof of mastery or interview readiness/i)).toBeInTheDocument();
    expect(screen.queryByText(/improved/i)).not.toBeInTheDocument();
  });

  it("renders completed and incomplete structured history without relabeling messages as practice", () => {
    render(<ProgressOverview summary={baseSummary} />);

    expect(screen.getByText("Technical interview · Databases · 2 user turns")).toBeInTheDocument();
    expect(screen.getByText("Completed structured practice")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View assessment" })).toHaveAttribute("href", "/conversations/interview-id#session-summary");
  });

  it("shows truthful zero activity and explains missing evidence for a new user", () => {
    const empty = summaryWith({
      total_sessions: 0,
      mentor_sessions: 0,
      interview_sessions: 0,
      general_sessions: 0,
      team_sessions: 0,
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
      recent_sessions: [],
    });
    render(<ProgressOverview summary={empty} />);

    expect(screen.getByRole("heading", { name: "No practice history yet" })).toBeInTheDocument();
    expect(screen.getByText(/Evidence will appear after completed structured practice/)).toBeInTheDocument();
    expect(screen.queryByText("Recent strength")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent area to improve")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Mentor Mode" })).toHaveAttribute("href", "/dashboard#mentor-practice");
  });
});
