"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createConversation } from "../api";
import type { MentorTransport } from "../types";
import { FormatOptionCard } from "./format-option-card";

export function MentorEntry() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [transport, setTransport] = useState<MentorTransport>("text");
  const [error, setError] = useState<string | null>(null);

  async function startMentorMode() {
    setIsCreating(true);
    setError(null);
    try {
      const conversation = await createConversation(createClient(), {
        title: "Mentor session",
        mode: "mentor",
        ...(transport === "live_voice" ? { mentor_transport: transport } : {}),
      });
      router.push(transport === "live_voice" ? `/conversations/${conversation.id}/live-mentor` : `/conversations/${conversation.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError("We could not reach DevStride. Check your connection and try again.");
      } else {
        setError("Mentor Mode could not be started. Please try again.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form className="mentor-setup" onSubmit={(event) => { event.preventDefault(); void startMentorMode(); }}>
      <fieldset disabled={isCreating}>
        <legend>Mentor format</legend>
        <div className="format-options">
          <FormatOptionCard
            name="mentor-transport"
            value="text"
            title="Text Mentor"
            description="Practice through chat."
            checked={transport === "text"}
            onChange={() => setTransport("text")}
          />
          <FormatOptionCard
            name="mentor-transport"
            value="live_voice"
            title="Live Mentor"
            description="Practice by voice."
            note="Microphone required."
            checked={transport === "live_voice"}
            onChange={() => setTransport("live_voice")}
          />
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={isCreating}>
        {isCreating ? "Opening…" : transport === "live_voice" ? "Start Live Mentor" : "Start Text Mentor"}
      </button>
    </form>
  );
}
