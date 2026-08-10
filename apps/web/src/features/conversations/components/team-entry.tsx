"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createConversation } from "../api";
import type { TeamDifficulty, TeamScenario } from "../types";

const scenarios: Array<{ value: TeamScenario; label: string }> = [
  { value: "code_review", label: "Code review" },
  { value: "architecture_discussion", label: "Architecture discussion" },
  { value: "sprint_planning", label: "Sprint planning" },
  { value: "debugging_incident", label: "Debugging an incident" },
  { value: "technical_decision", label: "Technical decision" },
];

export function TeamEntry() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [scenario, setScenario] = useState<TeamScenario>("code_review");
  const [difficulty, setDifficulty] = useState<TeamDifficulty>("realistic");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTeamPractice() {
    setIsCreating(true);
    setError(null);
    try {
      const conversation = await createConversation(createClient(), {
        title: "Team Practice",
        mode: "team",
        team_scenario: scenario,
        team_difficulty: difficulty,
      });
      router.push(`/conversations/${conversation.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) router.push("/login");
      else if (cause instanceof ApiError && cause.status === 0) setError("We could not reach DevStride. Check your connection and try again.");
      else if (cause instanceof ApiError && cause.status === 429) setError(cause.message);
      else setError("Team Practice could not be started. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return <button type="button" onClick={() => setIsOpen(true)}>Start Team Practice</button>;
  }

  return (
    <form className="team-setup" onSubmit={(event) => { event.preventDefault(); void startTeamPractice(); }}>
      <fieldset disabled={isCreating}>
        <legend>Team Practice setup</legend>
        <label htmlFor="team-scenario">Scenario</label>
        <select id="team-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as TeamScenario)}>
          {scenarios.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <label htmlFor="team-difficulty">Difficulty</label>
        <select id="team-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as TeamDifficulty)}>
          <option value="guided">Guided</option>
          <option value="realistic">Realistic</option>
          <option value="challenging">Challenging</option>
        </select>
      </fieldset>
      <p className="field-hint">A simulated engineering discussion with a small labeled team cast.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={isCreating}>{isCreating ? "Opening…" : "Begin practice"}</button>
        <button type="button" className="button-secondary" onClick={() => setIsOpen(false)} disabled={isCreating}>Cancel</button>
      </div>
    </form>
  );
}
