"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createConversation } from "../api";

export function MentorEntry() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startMentorMode() {
    setIsCreating(true);
    setError(null);
    try {
      const conversation = await createConversation(createClient(), {
        title: "Mentor session",
        mode: "mentor",
      });
      router.push(`/conversations/${conversation.id}`);
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
    <>
      <button type="button" onClick={() => void startMentorMode()} disabled={isCreating}>
        {isCreating ? "Opening…" : "Start Mentor Mode"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}
