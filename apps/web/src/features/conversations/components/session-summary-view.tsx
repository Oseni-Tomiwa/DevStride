import React from "react";

import type { LiveAnalytics, SessionSummary } from "../types";

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return <div className="session-summary-section"><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>;
}

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "Not available";
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function LiveAnalyticsSection({ analytics }: { analytics: LiveAnalytics }) {
  const metrics = [
    ["Speaking pace", analytics.approximate_wpm === null ? "Not available" : `${Math.round(analytics.approximate_wpm)} WPM`],
    ["Candidate talk share", analytics.candidate_talk_share === null ? "Not available" : `${Math.round(analytics.candidate_talk_share)}%`],
    ["Average response latency", formatDuration(analytics.average_response_latency_ms)],
    ["Interruptions", String(analytics.interruption_count)],
    ["Filler words", analytics.filler_words_per_100 === null ? "Not available" : `${analytics.filler_words_per_100.toFixed(1)} per 100 words`],
    ["Session duration", formatDuration(analytics.session_duration_ms)],
  ] as const;
  return <div className="session-summary-section" aria-labelledby="live-analytics-title"><h3 id="live-analytics-title">Live communication</h3><p className="field-hint">Neutral coaching signals calculated from finalized transcript turns and session events. No raw audio is stored.</p><dl className="rating-grid">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}

export function SessionSummaryView({ summary, liveAnalytics = null }: { summary: SessionSummary; liveAnalytics?: LiveAnalytics | null }) {
  const ratingCandidates: Array<[string, number | null]> = [
    ["Correctness", summary.correctness_rating],
    ["Clarity", summary.clarity_rating],
    ["Depth", summary.depth_rating],
    ["Reasoning", summary.reasoning_rating],
  ];
  const ratings = ratingCandidates.filter((rating): rating is [string, number] => typeof rating[1] === "number");

  return (
    <section className="session-summary" id="session-summary" aria-labelledby="session-summary-title">
      <div className="session-summary-heading">
        <div><p className="eyebrow">Session summary</p><h2 id="session-summary-title">What this session showed</h2></div>
        <span className="status-pill status-pill-success">Structured observation</span>
      </div>
      <p className="session-summary-lede">{summary.summary}</p>
      <SummaryList title="Topics covered" items={summary.topics_covered} />
      <SummaryList title="Strengths observed" items={summary.strengths} />
      <SummaryList title="Areas to improve" items={summary.weaknesses} />
      <SummaryList title="Recommended next steps" items={summary.recommended_next_steps} />
      {summary.session_mode === "mentor" && (
        <>
          <SummaryList title="Concepts practiced" items={summary.concepts_practiced ?? []} />
          <SummaryList title="Exercises completed" items={summary.exercises_completed ?? []} />
        </>
      )}
      {summary.session_mode === "interview" && ratings.length > 0 && (
        <div className="session-summary-section"><h3>Practice ratings</h3><p className="field-hint">Practice observations only, not hiring predictions.</p><dl className="rating-grid">{ratings.map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{value} / 5</dd></div>)}</dl></div>
      )}
      {summary.session_mode === "interview" && liveAnalytics && <LiveAnalyticsSection analytics={liveAnalytics} />}
    </section>
  );
}
