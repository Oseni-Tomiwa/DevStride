import { RecommendationCard } from "../../progress/components/progress-overview";
import type { PracticeReport } from "../types";

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return <div className="session-summary-section"><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>;
}

function formatDuration(milliseconds: number | null): string {
  return milliseconds === null ? "Not available" : `${(milliseconds / 1000).toFixed(1)}s`;
}

function Analytics({ report }: { report: PracticeReport }) {
  const analytics = report.analytics;
  if (!analytics) return null;
  const metrics = [
    ["Speaking pace", analytics.approximate_wpm === null ? "Not available" : `${Math.round(analytics.approximate_wpm)} WPM`],
    ["Candidate talk share", analytics.candidate_talk_share === null ? "Not available" : `${Math.round(analytics.candidate_talk_share)}%`],
    ["Average response latency", formatDuration(analytics.average_response_latency_ms)],
    ["Interruptions", String(analytics.interruption_count)],
    ["Filler words", analytics.filler_words_per_100 === null ? "Not available" : `${analytics.filler_words_per_100.toFixed(1)} per 100 words`],
    ["Session duration", formatDuration(analytics.session_duration_ms)],
  ] as const;
  return <div className="session-summary-section"><h3>Live communication</h3><p className="field-hint">Neutral signals calculated from finalized transcript turns and session events. No raw audio is stored.</p><dl className="rating-grid">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}

export function PracticeReportView({ report }: { report: PracticeReport }) {
  const summary = report.summary;
  const modeLabel = report.mode === "mentor" ? "Mentor Mode" : report.mode === "interview" ? "Interview Mode" : "Team Practice";
  const insufficient = report.evidence_status === "insufficient";
  const ratings = summary ? [
    ["Correctness", summary.correctness_rating],
    ["Clarity", summary.clarity_rating],
    ["Depth", summary.depth_rating],
    ["Reasoning", summary.reasoning_rating],
  ].filter((item): item is [string, number] => typeof item[1] === "number") : [];

  return (
    <section className="session-summary practice-report" id="session-summary" aria-labelledby="practice-report-title">
      <div className="session-summary-heading">
        <div><p className="eyebrow">Practice report</p><h2 id="practice-report-title">{report.completion_status === "completed" ? "Practice complete" : "Practice report"}</h2></div>
        <span className="mode-pill">{modeLabel}</span>
      </div>
      {(report.goal || report.focus) && <dl className="report-context">{report.goal && <div><dt>Goal</dt><dd>{report.goal.title}{report.goal.status !== "active" ? " · Historical" : ""}</dd></div>}{report.focus && <div><dt>Focus</dt><dd>{report.focus.title}{report.focus.status !== "active" ? " · Historical" : ""}</dd></div>}</dl>}
      {insufficient ? <div className="report-evidence-state" role="status"><h3>Not enough evidence to assess this session.</h3><p className="muted">A substantive user response is needed before strengths, improvement areas, or ratings can be reported.</p></div> : summary ? <>
        <p className="session-summary-lede">{summary.summary}</p>
        <SummaryList title="What you practiced" items={summary.topics_covered} />
        <SummaryList title="What you demonstrated" items={summary.strengths} />
        <SummaryList title="What to work on" items={summary.weaknesses} />
        {report.mode === "mentor" && <><SummaryList title="Concepts practiced" items={summary.concepts_practiced ?? []} /><SummaryList title="Exercises completed" items={summary.exercises_completed ?? []} /></>}
        {report.mode === "interview" && ratings.length > 0 && <div className="session-summary-section"><h3>Practice ratings</h3><p className="field-hint">Practice observations only, not hiring predictions.</p><dl className="rating-grid">{ratings.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value} / 5</dd></div>)}</dl></div>}
      </> : <div className="report-evidence-state" role="status"><h3>Report evidence is not available yet.</h3><p className="muted">Complete more practice before reviewing a grounded report.</p></div>}
      <Analytics report={report} />
      {report.recommendation && <div className="report-next-practice"><p className="eyebrow">Next practice</p><RecommendationCard recommendation={report.recommendation} /></div>}
    </section>
  );
}
