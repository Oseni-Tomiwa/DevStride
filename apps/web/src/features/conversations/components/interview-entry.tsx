"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createConversation } from "../api";
import type { InterviewFocus, InterviewTransport, InterviewType } from "../types";

const focusOptions: Array<{ value: InterviewFocus; label: string }> = [
  { value: "general_backend", label: "General backend" },
  { value: "apis", label: "APIs" },
  { value: "databases", label: "Databases" },
  { value: "javascript_node", label: "JavaScript / Node.js" },
  { value: "python", label: "Python" },
  { value: "system_design", label: "System design fundamentals" },
];

export function InterviewEntry() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [interviewType, setInterviewType] = useState<InterviewType>("technical");
  const [interviewFocus, setInterviewFocus] = useState<InterviewFocus | "">("");
  const [transport, setTransport] = useState<InterviewTransport>("text");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startInterview() {
    setIsCreating(true);
    setError(null);
    try {
      const conversation = await createConversation(createClient(), {
        title: `${interviewType === "technical" ? "Technical" : "Behavioral"} interview`,
        mode: "interview",
        interview_type: interviewType,
        ...(interviewType === "technical" && interviewFocus ? { interview_focus: interviewFocus } : {}),
        ...(transport === "live_voice" ? { interview_transport: transport } : {}),
      });
      router.push(transport === "live_voice" ? `/conversations/${conversation.id}/live-spike` : `/conversations/${conversation.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError("We could not reach DevStride. Check your connection and try again.");
      } else if (cause instanceof ApiError && cause.status === 429) {
        setError(cause.message);
      } else {
        setError("The interview could not be started. Please try again.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return <button type="button" onClick={() => setIsOpen(true)}>Start Interview Mode</button>;
  }

  return (
    <form className="interview-setup" onSubmit={(event) => { event.preventDefault(); void startInterview(); }}>
      <fieldset disabled={isCreating}>
        <legend>Interview setup</legend>
        <label htmlFor="interview-type">Interview type</label>
        <select id="interview-type" value={interviewType} onChange={(event) => setInterviewType(event.target.value as InterviewType)}>
          <option value="technical">Technical</option>
          <option value="behavioral">Behavioral</option>
        </select>
        {interviewType === "technical" && (
          <>
            <label htmlFor="interview-focus">Technical focus <span className="muted">(optional)</span></label>
            <select id="interview-focus" value={interviewFocus} onChange={(event) => setInterviewFocus(event.target.value as InterviewFocus)}>
              <option value="">No specific focus</option>
              {focusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </>
        )}
        <fieldset>
          <legend>Interview format</legend>
          <label><input type="radio" name="interview-transport" value="text" checked={transport === "text"} onChange={() => setTransport("text")} /> Text interview</label>
          <label><input type="radio" name="interview-transport" value="live_voice" checked={transport === "live_voice"} onChange={() => setTransport("live_voice")} /> Live voice <span className="muted">(experimental)</span></label>
        </fieldset>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={isCreating}>{isCreating ? "Opening…" : "Begin interview"}</button>
        <button type="button" className="button-secondary" onClick={() => setIsOpen(false)} disabled={isCreating}>Cancel</button>
      </div>
    </form>
  );
}
