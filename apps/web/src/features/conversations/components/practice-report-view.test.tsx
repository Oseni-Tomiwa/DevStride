import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import type { PracticeReport } from "../types";
import { PracticeReportView } from "./practice-report-view";

const recommendation = {
  activity: "mentor" as const,
  title: "Reinforce API trade-offs",
  reason: "Recent Interview evidence shows this area needs reinforcement.",
  evidence: ["Observed in linked practice."],
  action: {
    kind: "start_practice" as const,
    mode: "mentor" as const,
    conversation_id: null,
    goal_id: null,
    focus_area_id: null,
    interview_type: null,
    interview_focus: null,
    team_scenario: null,
    team_difficulty: null,
  },
};

const summary = {
  id: "summary-1",
  conversation_id: "conversation-1",
  session_mode: "interview" as const,
  summary: "A grounded interview practice report.",
  topics_covered: ["API design"],
  strengths: ["Clear trade-offs"],
  weaknesses: ["Explain failure handling"],
  recommended_next_steps: ["Practice failure handling"],
  concepts_practiced: null,
  exercises_completed: null,
  correctness_rating: 4,
  clarity_rating: 3,
  depth_rating: 3,
  reasoning_rating: 4,
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-01T11:00:00Z",
};

function report(overrides: Partial<PracticeReport> = {}): PracticeReport {
  return {
    conversation_id: "conversation-1",
    mode: "interview",
    transport: "text",
    completion_status: "completed",
    completed_at: "2026-08-01T11:00:00Z",
    goal: { title: "Backend readiness", status: "active" },
    focus: { title: "API design", status: "active" },
    evidence_status: "available",
    summary,
    analytics: null,
    recommendation,
    ...overrides,
  };
}

describe("PracticeReportView", () => {
  it("renders evidence, ratings, Goal/Focus context, and next practice", () => {
    render(<PracticeReportView report={report()} />);

    expect(screen.getByRole("heading", { name: "Practice complete" })).toBeInTheDocument();
    expect(screen.getByText("What you practiced")).toBeInTheDocument();
    expect(screen.getByText("Clear trade-offs")).toBeInTheDocument();
    expect(screen.getByText("Explain failure handling")).toBeInTheDocument();
    expect(screen.getByText("Backend readiness")).toBeInTheDocument();
    expect(screen.getAllByText("API design")).toHaveLength(2);
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("Reinforce API trade-offs")).toBeInTheDocument();
  });

  it("puts strengths and improvement areas ahead of supporting topic detail", () => {
    render(<PracticeReportView report={report()} />);

    const strengths = screen.getByRole("heading", { name: "What you demonstrated" });
    const topics = screen.getByRole("heading", { name: "What you practiced" });
    expect(strengths.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders an honest insufficient-evidence state without strengths or ratings", () => {
    render(<PracticeReportView report={report({ evidence_status: "insufficient", summary: null })} />);

    expect(screen.getByRole("status")).toHaveTextContent("Not enough evidence to assess this session.");
    expect(screen.queryByText("What you demonstrated")).not.toBeInTheDocument();
    expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
    expect(screen.getByText("Reinforce API trade-offs")).toBeInTheDocument();
  });

  it("keeps Mentor reports free of Interview ratings and renders concepts", () => {
    render(<PracticeReportView report={report({
      mode: "mentor",
      summary: { ...summary, session_mode: "mentor", concepts_practiced: ["Indexes"], exercises_completed: ["Design an index"] },
    })} />);

    expect(screen.getAllByText("Mentor Mode")).toHaveLength(2);
    expect(screen.getByText("Concepts practiced")).toBeInTheDocument();
    expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
  });

  it("renders optional Live Interview analytics without requiring them", () => {
    render(<PracticeReportView report={report({ analytics: {
      conversation_id: "conversation-1",
      candidate_speaking_ms: 60000,
      interviewer_speaking_ms: 60000,
      candidate_talk_share: 50,
      candidate_turn_count: 2,
      interviewer_turn_count: 3,
      average_candidate_response_ms: 3000,
      longest_candidate_response_ms: 5000,
      average_response_latency_ms: 2000,
      interruption_count: 1,
      reconnect_count: 0,
      mute_count: 0,
      session_duration_ms: 180000,
      finalized_word_count: 100,
      approximate_wpm: 100,
      filler_word_count: 2,
      filler_words_per_100: 2,
    } })} />);

    expect(screen.getByText("Live communication")).toBeInTheDocument();
    expect(screen.getByText("100 WPM")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});
