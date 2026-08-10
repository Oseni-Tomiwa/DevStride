"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createConversation } from "../api";
import type { InterviewFocus, InterviewType } from "../types";

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
      });
      router.push(`/conversations/${conversation.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError("We could not reach DevStride. Check your connection and try again.");
      } else {
        setError("The interview could not be started. Please try again.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  if (!isOpen) {
    return <button type="button" onClick={() => setIsOpen(true)}>Start Mock Interview</button>;
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
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={isCreating}>{isCreating ? "Opening…" : "Begin interview"}</button>
        <button type="button" className="button-secondary" onClick={() => setIsOpen(false)} disabled={isCreating}>Cancel</button>
      </div>
    </form>
  );
}
