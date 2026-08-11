import Link from "next/link";
import React from "react";

import type {
  ContinuePractice,
  ProgressEvidence,
  ProgressMode,
  ProgressRecommendation,
  ProgressSession,
  ProgressSummary,
  RatingHistoryItem,
} from "../types";

const focusLabels: Record<string, string> = {
  general_backend: "General backend",
  apis: "APIs",
  databases: "Databases",
  javascript_node: "JavaScript / Node.js",
  python: "Python",
  system_design: "System design",
};
const teamScenarioLabels: Record<string, string> = {
  code_review: "Code review",
  architecture_discussion: "Architecture discussion",
  sprint_planning: "Sprint planning",
  debugging_incident: "Debugging incident",
  technical_decision: "Technical decision",
};
const modeLabels: Record<ProgressMode, string> = {
  general: "General",
  mentor: "Mentor",
  interview: "Interview",
  team: "Team Practice",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function modeLabel(session: ProgressSession): string {
  if (session.mode === "mentor") return "Mentor session";
  if (session.mode === "interview") {
    return session.interview_type === "behavioral" ? "Behavioral interview" : "Technical interview";
  }
  if (session.mode === "team") return "Team Practice";
  return "General conversation";
}

function sessionContext(session: ProgressSession): string | null {
  if (session.interview_focus) return focusLabels[session.interview_focus] ?? session.interview_focus;
  if (session.team_scenario) return teamScenarioLabels[session.team_scenario] ?? session.team_scenario;
  return null;
}

function sessionStatus(session: ProgressSession): string {
  if (!session.practiced) return "Not yet practiced";
  if (session.mode === "general") return "Practiced";
  if (session.structured_completed) return "Completed structured practice";
  return "In progress";
}

function SessionItem({ session }: { session: ProgressSession }) {
  const context = sessionContext(session);
  const status = sessionStatus(session);
  const hasReport = session.summary_available || session.has_final_assessment;

  return (
    <li className="progress-session">
      <div className="progress-session-row">
        <Link href={`/conversations/${session.id}`} className="progress-session-link">
          <span className="progress-session-primary">
            <strong>{session.title}</strong>
            <span className="progress-session-meta">
              {modeLabel(session)}
              {context ? ` · ${context}` : ""}
              {` · ${session.user_turns} user ${session.user_turns === 1 ? "turn" : "turns"}`}
            </span>
          </span>
          <span className="progress-session-side">
            <span>Updated {formatDateTime(session.updated_at)}</span>
            <span
              className={session.structured_completed ? "status-pill status-pill-success" : "status-pill"}
            >
              {status}
            </span>
          </span>
        </Link>
        {hasReport && (
          <Link href={`/conversations/${session.id}#session-summary`} className="text-link">
            {session.has_final_assessment ? "View assessment" : "View summary"}
          </Link>
        )}
      </div>
    </li>
  );
}

function recommendationHref(recommendation: ProgressRecommendation): string {
  if (recommendation.action.kind === "continue_conversation" && recommendation.action.conversation_id) {
    return `/conversations/${recommendation.action.conversation_id}`;
  }
  if (recommendation.action.mode === "interview") return "/dashboard#interview-practice";
  if (recommendation.action.mode === "team") return "/dashboard#team-practice";
  return "/dashboard#mentor-practice";
}

function recommendationActionLabel(recommendation: ProgressRecommendation): string {
  if (recommendation.action.kind === "continue_conversation") return "Continue practice";
  if (recommendation.action.mode === "interview") return "Start Mock Interview";
  if (recommendation.action.mode === "team") return "Start Team Practice";
  return "Start Mentor Mode";
}

export function RecommendationCard({ recommendation }: { recommendation: ProgressRecommendation }) {
  return (
    <section className="recommendation-card" aria-labelledby="recommendation-title">
      <div className="recommendation-copy">
        <div className="recommendation-heading">
          <p className="eyebrow">Recommended next practice</p>
          <span className="mode-pill">{recommendation.activity === "continue" ? "Continue" : modeLabels[recommendation.activity]}</span>
        </div>
        <h2 id="recommendation-title">{recommendation.title}</h2>
        <p>{recommendation.reason}</p>
        {recommendation.evidence.length > 0 && (
          <ul className="recommendation-evidence" aria-label="Recommendation evidence">
            {recommendation.evidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </div>
      <Link href={recommendationHref(recommendation)} className="landing-button recommendation-action">
        {recommendationActionLabel(recommendation)}
      </Link>
    </section>
  );
}

export function ContinuePracticeCard({ practice }: { practice: ContinuePractice }) {
  const context = practice.interview_focus
    ? focusLabels[practice.interview_focus] ?? practice.interview_focus
    : practice.team_scenario
      ? teamScenarioLabels[practice.team_scenario] ?? practice.team_scenario
      : practice.interview_type;

  return (
    <section className="continue-card" aria-labelledby="continue-practice-title">
      <div>
        <p className="eyebrow">Continue practice</p>
        <h2 id="continue-practice-title">{practice.title}</h2>
        <p className="muted">
          {modeLabels[practice.mode]}{context ? ` · ${context}` : ""} · Last activity {formatDateTime(practice.last_activity_at)}
        </p>
      </div>
      <Link href={`/conversations/${practice.conversation_id}`} className="landing-button landing-button-secondary">
        Continue {practice.title}
      </Link>
    </section>
  );
}

function ProgressSnapshot({ summary, showBreakdown }: { summary: ProgressSummary; showBreakdown: boolean }) {
  const metrics = [
    [summary.activity.practiced_sessions, "Practiced sessions"],
    [summary.activity.completed_sessions, "Completed structured sessions"],
    [summary.activity.user_turns, "User turns"],
    [summary.activity.practiced_sessions_last_30_days, "Practice in last 30 days"],
  ] as const;

  return (
    <section className="progress-snapshot" aria-labelledby="progress-snapshot-title">
      <div className="summary-heading">
        <p className="eyebrow">Progress snapshot</p>
        <h2 id="progress-snapshot-title">Practice activity</h2>
      </div>
      <dl className="progress-counts" aria-label="Practice activity metrics">
        {metrics.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {showBreakdown && (
        <div className="mode-breakdown">
          <h3>Practice by mode</h3>
          <dl>
            {(Object.keys(modeLabels) as ProgressMode[]).map((mode) => (
              <div key={mode}>
                <dt>{modeLabels[mode]}</dt>
                <dd>{summary.activity.mode_breakdown[mode]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function EvidenceCard({ label, evidence }: { label: string; evidence: ProgressEvidence }) {
  return (
    <article className="evidence-card">
      <p className="evidence-label">{label}</p>
      <h3>{evidence.text}</h3>
      <p className="muted">
        {evidence.occurrences} {evidence.occurrences === 1 ? "observation" : "observations"} · Latest {formatDate(evidence.latest_at)}
      </p>
      <p className="evidence-modes">Observed in {evidence.modes.map((mode) => modeLabels[mode]).join(", ")}</p>
      <Link href={`/conversations/${evidence.conversation_id}`} className="text-link">View supporting session</Link>
    </article>
  );
}

function CurrentEvidence({ summary, detailed }: { summary: ProgressSummary; detailed: boolean }) {
  const hasCurrentEvidence = summary.current_focus || summary.recent_strength || summary.recent_weakness;
  const hasRecurringEvidence = summary.recurring_strengths.length > 0 || summary.recurring_weaknesses.length > 0;
  if (!hasCurrentEvidence && (!detailed || !hasRecurringEvidence)) return null;

  return (
    <section className="progress-evidence" aria-labelledby="current-evidence-title">
      <div className="summary-heading">
        <p className="eyebrow">Current evidence</p>
        <h2 id="current-evidence-title">What your practice is showing</h2>
      </div>
      {hasCurrentEvidence && (
        <div className="evidence-grid">
          {summary.current_focus && (
            <article className="evidence-card focus-card">
              <p className="evidence-label">Current focus</p>
              <h3>{summary.current_focus.label}</h3>
              <p className="muted">
                Based on your {summary.current_focus.basis === "communication_goal" ? "Profile" : "active saved Memory"}.
              </p>
            </article>
          )}
          {summary.recent_strength && <EvidenceCard label="Recent strength" evidence={summary.recent_strength} />}
          {summary.recent_weakness && <EvidenceCard label="Recent area to improve" evidence={summary.recent_weakness} />}
        </div>
      )}
      {detailed && hasRecurringEvidence && (
        <div className="recurring-evidence-grid">
          <div>
            <h3>Recurring strengths</h3>
            {summary.recurring_strengths.length > 0 ? (
              <div className="evidence-list">
                {summary.recurring_strengths.map((item) => (
                  <EvidenceCard key={`${item.conversation_id}-${item.text}`} label="Recurring strength" evidence={item} />
                ))}
              </div>
            ) : <p className="muted">No recurring strengths have been recorded yet.</p>}
          </div>
          <div>
            <h3>Recurring areas to improve</h3>
            {summary.recurring_weaknesses.length > 0 ? (
              <div className="evidence-list">
                {summary.recurring_weaknesses.map((item) => (
                  <EvidenceCard key={`${item.conversation_id}-${item.text}`} label="Recurring area" evidence={item} />
                ))}
              </div>
            ) : <p className="muted">No recurring areas have been recorded yet.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function ratingGroupLabel(item: RatingHistoryItem): string {
  if (item.interview_type === "behavioral") return "Behavioral interviews";
  const focus = item.interview_focus ? focusLabels[item.interview_focus] ?? item.interview_focus : "General technical";
  return `${focus} interviews`;
}

function RatingHistory({ history }: { history: RatingHistoryItem[] }) {
  if (history.length === 0) return null;
  const groups = new Map<string, RatingHistoryItem[]>();
  for (const item of history) {
    const key = `${item.interview_type ?? "technical"}:${item.interview_focus ?? "general"}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <section className="rating-history" aria-labelledby="rating-history-title">
      <div className="summary-heading">
        <p className="eyebrow">Interview observations</p>
        <h2 id="rating-history-title">Recorded rating history</h2>
      </div>
      <p className="muted rating-disclaimer">Practice observations are grouped only with compatible Interview type and focus. They are not proof of mastery or interview readiness.</p>
      <div className="rating-history-groups">
        {[...groups.values()].map((items) => {
          const latest = items.at(-1);
          return (
            <section className="rating-history-group" key={`${items[0].interview_type}-${items[0].interview_focus}`}>
              <h3>{ratingGroupLabel(items[0])}</h3>
              <ol>
                {items.map((item) => {
                  const ratings = [
                    ["Correctness", item.correctness],
                    ["Clarity", item.clarity],
                    ["Depth", item.depth],
                    ["Reasoning", item.reasoning],
                  ].filter((rating): rating is [string, number] => rating[1] !== null);
                  return (
                    <li key={`${item.conversation_id}-${item.observed_at}`}>
                      <div className="rating-observation-heading">
                        <Link href={`/conversations/${item.conversation_id}#session-summary`}>{formatDate(item.observed_at)}</Link>
                        {item === latest && <span className="status-pill">Latest recorded rating</span>}
                      </div>
                      <dl className="rating-observation-values">
                        {ratings.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value} / 5</dd></div>)}
                      </dl>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function ProgressEmptyState() {
  return (
    <div className="conversation-empty progress-empty" role="status">
      <h3>No practice history yet</h3>
      <p className="muted">Your activity will appear after you send your first practice message. Strengths and areas to improve appear only after structured practice produces a summary.</p>
      <div className="progress-empty-actions">
        <Link href="/dashboard#mentor-practice" className="landing-button">Start Mentor Mode</Link>
        <Link href="/dashboard#interview-practice" className="landing-button landing-button-secondary">Start Mock Interview</Link>
      </div>
    </div>
  );
}

type ProgressOverviewProps = {
  summary: ProgressSummary;
  compact?: boolean;
};

export function ProgressOverview({ summary, compact = false }: ProgressOverviewProps) {
  const sessions = compact ? summary.recent_sessions.slice(0, 3) : summary.recent_sessions;
  if (compact) {
    return (
      <div className="dashboard-intelligence">
        <RecommendationCard recommendation={summary.recommendation} />
        {summary.continue_practice && <ContinuePracticeCard practice={summary.continue_practice} />}
        <ProgressSnapshot summary={summary} showBreakdown={false} />
        <CurrentEvidence summary={summary} detailed={false} />
        <Link href="/progress" className="text-link dashboard-progress-link">View detailed progress</Link>
      </div>
    );
  }

  return (
    <div className="progress-intelligence">
      <ProgressSnapshot summary={summary} showBreakdown />
      <RecommendationCard recommendation={summary.recommendation} />
      {summary.continue_practice && <ContinuePracticeCard practice={summary.continue_practice} />}
      <CurrentEvidence summary={summary} detailed />
      {!summary.recent_strength && !summary.recent_weakness && summary.recurring_strengths.length === 0 && summary.recurring_weaknesses.length === 0 && (
        <p className="progress-evidence-empty">Evidence will appear after completed structured practice has a session summary.</p>
      )}
      <RatingHistory history={summary.rating_history} />
      <section className="progress-history" aria-labelledby="practice-history-title">
        <div className="summary-heading">
          <p className="eyebrow">Practice history</p>
          <h2 id="practice-history-title">Sessions and conversations</h2>
        </div>
        {sessions.length === 0 ? (
          <ProgressEmptyState />
        ) : (
          <ul className="progress-session-list">
            {sessions.map((session) => <SessionItem key={session.id} session={session} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
