import React from "react";
import Link from "next/link";

import type { ProgressSession, ProgressSummary } from "../types";

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

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function modeLabel(session: ProgressSession): string {
  if (session.mode === "mentor") return "Mentor session";
  if (session.mode === "interview") return session.interview_type === "behavioral" ? "Behavioral interview" : "Technical interview";
  if (session.mode === "team") return "Team Practice";
  return "General conversation";
}

function interviewStatus(session: ProgressSession): string | null {
  if (session.mode !== "interview") return null;
  if (session.has_final_assessment && session.interview_completed) return "Final assessment available";
  if (session.interview_started) return "In progress";
  return "Not started";
}

function SessionItem({ session }: { session: ProgressSession }) {
  const status = interviewStatus(session);
  return (
    <li className="progress-session">
      <div className="progress-session-row">
        <Link href={`/conversations/${session.id}`} className="progress-session-link">
          <span>
            <strong>{session.title}</strong>
            <span className="progress-session-meta">
              {modeLabel(session)}
              {session.interview_focus ? ` · ${focusLabels[session.interview_focus] ?? session.interview_focus}` : ""}
              {session.team_scenario ? ` · ${teamScenarioLabels[session.team_scenario] ?? session.team_scenario}` : ""}
              {` · ${session.has_messages ? `${session.message_count} messages` : "No messages yet"}`}
            </span>
          </span>
          <span className="progress-session-side">
            <span>{formatUpdatedAt(session.updated_at)}</span>
            {status && <span className={session.interview_completed ? "status-pill status-pill-success" : "status-pill"}>{status}</span>}
          </span>
        </Link>
        {session.summary_available && <Link href={`/conversations/${session.id}#session-summary`} className="text-link">View summary</Link>}
      </div>
    </li>
  );
}

type ProgressOverviewProps = {
  summary: ProgressSummary;
  compact?: boolean;
};

export function ProgressOverview({ summary, compact = false }: ProgressOverviewProps) {
  const sessions = compact ? summary.recent_sessions.slice(0, 3) : summary.recent_sessions;
  return (
    <section className={compact ? "progress-overview progress-overview-compact" : "progress-overview"} aria-labelledby="progress-overview-title">
      <div className="summary-heading progress-overview-heading">
        <div>
          <p className="eyebrow">Progress</p>
          <h2 id="progress-overview-title">Your practice history</h2>
        </div>
        {compact && <Link href="/progress" className="text-link">View all progress</Link>}
      </div>
      <div className="progress-counts" aria-label="Practice session counts">
        <div><strong>{summary.total_sessions}</strong><span>Total sessions</span></div>
        <div><strong>{summary.mentor_sessions}</strong><span>Mentor sessions</span></div>
        <div><strong>{summary.interview_sessions}</strong><span>Mock interviews</span></div>
        <div><strong>{summary.general_sessions}</strong><span>General conversations</span></div>
        <div><strong>{summary.team_sessions}</strong><span>Team sessions</span></div>
      </div>
      <div className="progress-history">
        <h3>Recent practice</h3>
        {sessions.length === 0 ? (
          <p className="muted">Your completed and in-progress practice sessions will appear here.</p>
        ) : (
          <ul className="progress-session-list">
            {sessions.map((session) => <SessionItem key={session.id} session={session} />)}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ProgressEmptyState() {
  return (
    <div className="conversation-empty progress-empty" role="status">
      <h2>No practice history yet</h2>
      <p className="muted">Start a Mentor session or mock interview to build your first practice record.</p>
      <div className="progress-empty-actions">
        <Link href="/dashboard#mentor-practice" className="landing-button">Start Mentor Mode</Link>
        <Link href="/dashboard#interview-practice" className="landing-button landing-button-secondary">Start Mock Interview</Link>
      </div>
    </div>
  );
}
