import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { SessionSummaryView } from "./session-summary-view";

const summary = {
  id: "summary-1",
  conversation_id: "conversation-1",
  session_mode: "interview" as const,
  summary: "A grounded interview practice session.",
  topics_covered: [],
  strengths: [],
  weaknesses: [],
  recommended_next_steps: [],
  concepts_practiced: null,
  exercises_completed: null,
  correctness_rating: null,
  clarity_rating: null,
  depth_rating: null,
  reasoning_rating: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("SessionSummaryView", () => {
  it("renders live communication analytics when supplied", () => {
    render(<SessionSummaryView summary={summary} liveAnalytics={{
      conversation_id: "conversation-1",
      candidate_speaking_ms: 9_000,
      interviewer_speaking_ms: 3_000,
      candidate_talk_share: 75,
      candidate_turn_count: 2,
      interviewer_turn_count: 2,
      average_candidate_response_ms: 4_500,
      longest_candidate_response_ms: 6_000,
      average_response_latency_ms: 1_000,
      interruption_count: 1,
      reconnect_count: 1,
      mute_count: 1,
      session_duration_ms: 20_000,
      finalized_word_count: 20,
      approximate_wpm: 133.3,
      filler_word_count: 4,
      filler_words_per_100: 20,
    }} />);

    expect(screen.getByRole("heading", { name: "Live communication" })).toBeInTheDocument();
    expect(screen.getByText("133 WPM")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("1.0s")).toBeInTheDocument();
    expect(screen.getByText("20.0 per 100 words")).toBeInTheDocument();
  });

  it("does not render live communication for a text interview without analytics", () => {
    render(<SessionSummaryView summary={summary} />);
    expect(screen.queryByRole("heading", { name: "Live communication" })).not.toBeInTheDocument();
  });
});
