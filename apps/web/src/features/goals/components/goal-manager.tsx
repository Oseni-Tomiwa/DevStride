"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import {
  archiveFocusArea,
  archiveGoal,
  createGoal,
  launchFocusAreaPractice,
  previewPlan,
  reorderFocusAreas,
  updateFocusArea,
  updateGoal,
} from "../api";
import type { FocusAreaDraft, Goal, GoalProgress, GoalType, PlanPreview, PlanPreviewSuggestion, PracticeConfig, PracticeMode } from "../types";

const supabase = createClient();
const goalTypeLabels: Record<GoalType, string> = {
  interview_preparation: "Interview preparation",
  technical_growth: "Technical growth",
  communication: "Communication",
  custom: "Custom",
};
const modeLabels: Record<PracticeMode, string> = { mentor: "Mentor", interview: "Interview", team: "Team Practice" };

function safeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "That change conflicts with the current goal state. Refresh and try again.";
  if (error instanceof ApiError && error.status === 404) return "This goal or focus area is no longer available.";
  return "We could not save that change. Please try again.";
}

function defaultConfig(mode: PracticeMode): PracticeConfig {
  if (mode === "interview") return { interview_type: "technical", interview_focus: "general_backend" };
  if (mode === "team") return { team_scenario: "code_review", team_difficulty: "guided" };
  return {};
}

function suggestionDraft(item: PlanPreviewSuggestion): FocusAreaDraft {
  return { title: item.title, description: item.description, practice_mode: item.practice_mode, practice_config: item.practice_config };
}

function FocusConfigFields({ mode, config, onChange }: { mode: PracticeMode; config: PracticeConfig; onChange: (config: PracticeConfig) => void }) {
  if (mode === "mentor") return <p className="field-hint">Profile-aware Mentor practice.</p>;
  if (mode === "interview") {
    const value = ("interview_type" in config ? config : defaultConfig("interview")) as Extract<PracticeConfig, { interview_type: unknown }>;
    return <div className="goal-config-grid">
      <label>Interview type<select value={value.interview_type} onChange={(event) => onChange({ interview_type: event.target.value as "technical" | "behavioral", interview_focus: event.target.value === "behavioral" ? null : value.interview_focus ?? "general_backend" })}><option value="technical">Technical</option><option value="behavioral">Behavioral</option></select></label>
      {value.interview_type === "technical" && <label>Focus<select value={value.interview_focus ?? "general_backend"} onChange={(event) => onChange({ ...value, interview_focus: event.target.value as NonNullable<typeof value.interview_focus> })}><option value="general_backend">General backend</option><option value="apis">APIs</option><option value="databases">Databases</option><option value="python">Python</option><option value="system_design">System design</option></select></label>}
    </div>;
  }
  const value = ("team_scenario" in config ? config : defaultConfig("team")) as Extract<PracticeConfig, { team_scenario: unknown }>;
  return <div className="goal-config-grid">
    <label>Scenario<select value={value.team_scenario} onChange={(event) => onChange({ ...value, team_scenario: event.target.value as typeof value.team_scenario })}><option value="code_review">Code review</option><option value="architecture_discussion">Architecture discussion</option><option value="sprint_planning">Sprint planning</option><option value="debugging_incident">Debugging incident</option><option value="technical_decision">Technical decision</option></select></label>
    <label>Difficulty<select value={value.team_difficulty} onChange={(event) => onChange({ ...value, team_difficulty: event.target.value as typeof value.team_difficulty })}><option value="guided">Guided</option><option value="realistic">Realistic</option><option value="challenging">Challenging</option></select></label>
  </div>;
}

function DraftEditor({ items, setItems }: { items: FocusAreaDraft[]; setItems: (items: FocusAreaDraft[]) => void }) {
  return <div className="goal-focus-editor">
    {items.map((item, index) => <article className="goal-focus-draft" key={`${item.title}-${index}`}>
      <div className="goal-focus-draft-heading"><span className="status-pill">Focus area {index + 1}</span><button type="button" className="button-quiet" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length <= 1}>Remove</button></div>
      <label>Title<input value={item.title} maxLength={120} onChange={(event) => setItems(items.map((current, itemIndex) => itemIndex === index ? { ...current, title: event.target.value } : current))} /></label>
      <label>Description<textarea value={item.description ?? ""} maxLength={500} onChange={(event) => setItems(items.map((current, itemIndex) => itemIndex === index ? { ...current, description: event.target.value || null } : current))} /></label>
      <label>Practice mode<select value={item.practice_mode} onChange={(event) => { const mode = event.target.value as PracticeMode; setItems(items.map((current, itemIndex) => itemIndex === index ? { ...current, practice_mode: mode, practice_config: defaultConfig(mode) } : current)); }}><option value="mentor">Mentor</option><option value="interview">Interview</option><option value="team">Team Practice</option></select></label>
      <FocusConfigFields mode={item.practice_mode} config={item.practice_config} onChange={(config) => setItems(items.map((current, itemIndex) => itemIndex === index ? { ...current, practice_config: config } : current))} />
      <div className="goal-reorder-actions"><button type="button" className="button-quiet" onClick={() => index > 0 && setItems(items.map((value, itemIndex) => itemIndex === index - 1 ? items[index] : itemIndex === index ? items[index - 1] : value))} disabled={index === 0}>Move up</button><button type="button" className="button-quiet" onClick={() => index < items.length - 1 && setItems(items.map((value, itemIndex) => itemIndex === index + 1 ? items[index] : itemIndex === index ? items[index + 1] : value))} disabled={index === items.length - 1}>Move down</button></div>
    </article>)}
    {items.length < 6 && <button type="button" className="landing-button landing-button-secondary" onClick={() => setItems([...items, { title: "", description: null, practice_mode: "mentor", practice_config: {} }])}>Add focus area</button>}
  </div>;
}

function PreviewSuggestions({ preview, selected, setSelected }: { preview: PlanPreview; selected: FocusAreaDraft[]; setSelected: (items: FocusAreaDraft[]) => void }) {
  const addSuggestion = (suggestion: PlanPreviewSuggestion) => {
    if (selected.some((item) => item.title.trim().toLowerCase() === suggestion.title.trim().toLowerCase()) || selected.length >= 6) return;
    setSelected([...selected, suggestionDraft(suggestion)]);
  };
  const removeSuggestion = (suggestion: PlanPreviewSuggestion) => setSelected(selected.filter((item) => item.title !== suggestion.title));
  const render = (suggestion: PlanPreviewSuggestion) => {
    const isSelected = selected.some((item) => item.title === suggestion.title);
    return <article className="goal-suggestion" key={`${suggestion.source}-${suggestion.title}`}><div><span className="mode-pill">{modeLabels[suggestion.practice_mode]}</span><h3>{suggestion.title}</h3><p>{suggestion.description}</p><p className="field-hint">{suggestion.reason}</p></div><button type="button" className="landing-button landing-button-secondary" onClick={() => isSelected ? removeSuggestion(suggestion) : addSuggestion(suggestion)}>{isSelected ? "Selected" : "Use suggestion"}</button></article>;
  };
  return <div className="goal-preview"><p className="muted">{preview.basis}. Choose the focus areas you want to keep, then edit them before saving.</p><div className="goal-suggestion-group"><h3>Suggested by DevStride</h3>{preview.template_suggestions.map(render)}</div>{preview.memory_suggestions.length > 0 && <div className="goal-suggestion-group"><h3>Saved context suggestions</h3><p className="field-hint">These come from your saved Memory and are optional.</p>{preview.memory_suggestions.map(render)}</div>}</div>;
}

function CreateGoal({ onCreated }: { onCreated: (goal: Goal) => void }) {
  const [stage, setStage] = useState<"type" | "details" | "preview" | "edit">("type");
  const [goalType, setGoalType] = useState<GoalType>("technical_growth");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusAreaDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const getPreview = async () => { if (!title.trim()) { setError("Add a title for this goal."); return; } setBusy(true); setError(null); try { const value = await previewPlan(supabase, { title: title.trim(), description: description.trim() || null, goal_type: goalType }); setPreview(value); setFocusAreas(value.template_suggestions.slice(0, 3).map(suggestionDraft)); setStage("preview"); } catch (cause) { setError(safeError(cause)); } finally { setBusy(false); } };
  const save = async () => { const cleaned = focusAreas.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => item.title); if (cleaned.length < 1 || cleaned.length > 6) { setError("Choose between one and six focus areas."); return; } setBusy(true); setError(null); try { onCreated(await createGoal(supabase, { title: title.trim(), description: description.trim() || null, goal_type: goalType, focus_areas: cleaned })); } catch (cause) { setError(safeError(cause)); } finally { setBusy(false); } };
  return <section className="goal-creation" aria-labelledby="create-goal-title"><div className="goal-stepper" aria-label="Goal creation steps"><span className={stage === "type" ? "active" : ""}>1. Intent</span><span className={stage === "details" ? "active" : ""}>2. Details</span><span className={stage === "preview" ? "active" : ""}>3. Suggestions</span><span className={stage === "edit" ? "active" : ""}>4. Confirm</span></div><h2 id="create-goal-title">Create a goal</h2>{stage === "type" && <div className="goal-type-grid">{(Object.keys(goalTypeLabels) as GoalType[]).map((value) => <button type="button" key={value} className={goalType === value ? "goal-type selected" : "goal-type"} onClick={() => setGoalType(value)}><strong>{goalTypeLabels[value]}</strong><span>{value === "interview_preparation" ? "Prepare for a specific interview path." : value === "technical_growth" ? "Build depth in an engineering area." : value === "communication" ? "Practice clearer technical communication." : "Define a direction that is personal to you."}</span></button>)}</div>}{stage === "type" && <button type="button" className="landing-button" onClick={() => setStage("details")}>Continue</button>}{stage !== "type" && <div className="goal-form"><label>Goal title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Become confident with backend system design" /></label><label>Description <span className="field-hint">(optional)</span><textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="What would meaningful progress look like?" /></label></div>}{stage === "details" && <button type="button" className="landing-button" onClick={getPreview} disabled={busy}>{busy ? "Preparing suggestions…" : "Suggest a plan"}</button>}{stage === "preview" && preview && <><PreviewSuggestions preview={preview} selected={focusAreas} setSelected={setFocusAreas} /><button type="button" className="landing-button" onClick={() => setStage("edit")}>Edit plan</button></>}{stage === "edit" && <><DraftEditor items={focusAreas} setItems={setFocusAreas} /><button type="button" className="landing-button" onClick={save} disabled={busy}>{busy ? "Saving goal…" : "Save goal"}</button></>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}

function ActiveGoal({ goal, initialProgress, onChanged }: { goal: Goal; initialProgress: GoalProgress | null; onChanged: (goal: Goal) => void }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refreshProgress = async () => { try { setProgress(await (await import("../api")).getGoalProgress(supabase, goal.id)); } catch { /* the goal remains usable if evidence is temporarily unavailable */ } };
  const saveGoal = async () => { setBusy("goal"); setError(null); try { const next = await updateGoal(supabase, goal.id, { title: title.trim(), description: description.trim() || null }); onChanged(next); setEditing(false); } catch (cause) { setError(safeError(cause)); } finally { setBusy(null); } };
  const setGoalStatus = async (status: "completed" | "active") => { setBusy(status); setError(null); try { onChanged(await updateGoal(supabase, goal.id, { status })); } catch (cause) { setError(safeError(cause)); } finally { setBusy(null); } };
  const archive = async () => { if (!window.confirm("Archive this goal? Archived goals are read-only.")) return; setBusy("archive"); try { await archiveGoal(supabase, goal.id); onChanged({ ...goal, status: "archived" }); } catch (cause) { setError(safeError(cause)); } finally { setBusy(null); } };
  const updateFocus = async (focusAreaId: string, input: unknown) => { setBusy(focusAreaId); setError(null); try { const focus = await updateFocusArea(supabase, goal.id, focusAreaId, input); onChanged({ ...goal, focus_areas: goal.focus_areas.map((item) => item.id === focus.id ? focus : item) }); await refreshProgress(); } catch (cause) { setError(safeError(cause)); } finally { setBusy(null); } };
  const editFocusTitle = async (item: Goal["focus_areas"][number]) => { const nextTitle = window.prompt("Focus area title", item.title)?.trim(); if (nextTitle && nextTitle !== item.title) await updateFocus(item.id, { title: nextTitle }); };
  const moveFocus = async (index: number, direction: -1 | 1) => { const next = [...goal.focus_areas]; const other = index + direction; if (other < 0 || other >= next.length) return; [next[index], next[other]] = [next[other], next[index]]; setBusy("reorder"); try { const reordered = await reorderFocusAreas(supabase, goal.id, next.filter((item) => item.status !== "archived").map((item) => item.id)); onChanged({ ...goal, focus_areas: reordered }); } catch (cause) { setError(safeError(cause)); } finally { setBusy(null); } };
  const nextAction = progress?.next_action ?? {
    title: goal.action.kind === "continue_conversation" ? "Continue your current practice" : "Start your next focus area",
    reason: goal.evidence[0] ?? "Your active Goal is the clearest place to continue practicing.",
    focus_area_id: goal.action.focus_area_id,
    action: goal.action,
  };
  const focusCount = progress?.total_focus_areas ?? goal.focus_areas.filter((item) => item.status !== "archived").length;
  const completedCount = progress?.completed_focus_areas ?? goal.focus_areas.filter((item) => item.status === "completed").length;
  return <div className="goal-detail"><section className="goal-hero"><div><p className="eyebrow">Active goal · {goalTypeLabels[goal.goal_type]}</p>{editing ? <div className="goal-form"><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label></div> : <><h2>{goal.title}</h2><p className="muted">{goal.description || "A focused plan for your next stage of development."}</p></>}</div><div className="goal-actions">{editing ? <><button type="button" className="landing-button" onClick={saveGoal} disabled={busy !== null}>Save changes</button><button type="button" className="button-quiet" onClick={() => setEditing(false)}>Cancel</button></> : <><button type="button" className="landing-button landing-button-secondary" onClick={() => setEditing(true)}>Edit goal</button>{goal.status === "completed" ? <button type="button" className="landing-button landing-button-secondary" onClick={() => setGoalStatus("active")} disabled={busy !== null}>Reopen</button> : <button type="button" className="landing-button landing-button-secondary" onClick={() => setGoalStatus("completed")} disabled={busy !== null}>Mark complete</button>}<button type="button" className="button-danger" onClick={archive} disabled={busy !== null}>Archive</button></>}</div></section><p className="goal-progress-count" role="status">{completedCount} of {focusCount} focus areas marked complete</p>{error && <p className="form-error" role="alert">{error}</p>}<section className="goal-current-focus" aria-labelledby="current-focus-title"><div><p className="eyebrow">Current focus</p><h2 id="current-focus-title">{progress?.current_focus?.label ?? goal.focus_areas.find((item) => item.status === "active")?.title ?? "Review your goal"}</h2><p className="muted">{nextAction.reason}</p></div>{nextAction.action.kind === "continue_conversation" && nextAction.action.conversation_id ? <Link className="landing-button" href={`/conversations/${nextAction.action.conversation_id}`}>Continue practice</Link> : nextAction.action.kind === "start_practice" && nextAction.focus_area_id ? <button type="button" className="landing-button" onClick={async () => { setBusy("launch"); try { const conversation = await launchFocusAreaPractice(supabase, goal.id, nextAction.focus_area_id!); router.push(`/conversations/${conversation.id}`); } catch (cause) { setError(safeError(cause)); } finally { setBusy(null); } }} disabled={busy !== null}>Start practice</button> : <Link className="landing-button landing-button-secondary" href="#focus-areas">Review focus areas</Link>}</section><section id="focus-areas" className="goal-focus-list" aria-labelledby="focus-areas-title"><div className="summary-heading"><p className="eyebrow">Plan</p><h2 id="focus-areas-title">Focus areas</h2></div>{goal.focus_areas.filter((item) => item.status !== "archived").map((item, index) => <article className="goal-focus-row" key={item.id}><div className="goal-focus-row-main"><span className="status-pill">{item.status === "completed" ? "Completed" : modeLabels[item.practice_mode]}</span><h3>{item.title}</h3><p className="muted">{item.description}</p><p className="field-hint">{progress?.focus_areas.find((value) => value.focus_area_id === item.id)?.linked_practiced_sessions ?? 0} linked practice sessions · {progress?.focus_areas.find((value) => value.focus_area_id === item.id)?.linked_user_turns ?? 0} user turns</p></div><div className="goal-focus-row-actions"><button type="button" className="button-quiet" onClick={() => void editFocusTitle(item)} disabled={busy !== null}>Edit</button><button type="button" className="button-quiet" onClick={() => updateFocus(item.id, { status: item.status === "completed" ? "active" : "completed" })} disabled={busy !== null}>{item.status === "completed" ? "Reopen" : "Complete"}</button><button type="button" className="button-quiet" onClick={() => moveFocus(index, -1)} disabled={index === 0 || busy !== null}>Up</button><button type="button" className="button-quiet" onClick={() => moveFocus(index, 1)} disabled={index === goal.focus_areas.length - 1 || busy !== null}>Down</button><button type="button" className="button-danger" onClick={() => { if (window.confirm("Archive this focus area?")) void archiveFocusArea(supabase, goal.id, item.id).then(() => onChanged({ ...goal, focus_areas: goal.focus_areas.map((value) => value.id === item.id ? { ...value, status: "archived" } : value) })).catch((cause) => setError(safeError(cause))); }}>Archive</button></div></article>)}</section></div>;
}

export function GoalManager({ initialGoals, initialProgress }: { initialGoals: Goal[]; initialProgress: GoalProgress | null }) {
  const [goals, setGoals] = useState(initialGoals);
  const [creating, setCreating] = useState(false);
  const activeGoal = goals.find((goal) => goal.status === "active") ?? null;
  const history = goals.filter((goal) => goal.status !== "active");
  const setGoal = (next: Goal) => { setGoals((current) => { const without = current.filter((goal) => goal.id !== next.id); return [next, ...without]; }); setCreating(false); };
  if (creating) return <CreateGoal onCreated={setGoal} />;
  return <div className="goals-content">{activeGoal ? <ActiveGoal goal={activeGoal} initialProgress={initialProgress} onChanged={setGoal} /> : <section className="conversation-empty goal-empty" role="status"><p className="eyebrow">Your direction</p><h2>Give your practice a clear shape.</h2><p className="muted">Profile tells DevStride who you are. A Goal tells it where you are heading and what to practice next.</p><button type="button" className="landing-button" onClick={() => setCreating(true)}>Create a goal</button></section>}{history.length > 0 && <section className="goal-history" aria-labelledby="goal-history-title"><div className="summary-heading"><p className="eyebrow">Past goals</p><h2 id="goal-history-title">Goal history</h2></div>{history.map((goal) => <article className="goal-history-row" key={goal.id}><div><h3>{goal.title}</h3><p className="muted">{goal.status === "completed" ? `Completed ${goal.completed_at ? new Date(goal.completed_at).toLocaleDateString() : ""}` : "Archived · read-only"} · {goal.focus_areas.length} focus areas</p></div><details><summary>View details</summary><ul>{goal.focus_areas.map((item) => <li key={item.id}>{item.title} · {modeLabels[item.practice_mode]}</li>)}</ul></details></article>)}</section>}</div>;
}
