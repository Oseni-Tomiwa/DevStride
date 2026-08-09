"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { respondToConversation } from "../api";
import type { Conversation, Message } from "../types";

const MESSAGE_MAX_LENGTH = 20_000;

type ConversationDetailProps = {
  conversation: Conversation;
  initialMessages: Message[];
};

function chronologicalMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  );
}

export function ConversationDetail({ conversation, initialMessages }: ConversationDetailProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(() => chronologicalMessages(initialMessages));
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError("Write a message before sending.");
      return;
    }
    if (trimmedContent.length > MESSAGE_MAX_LENGTH) {
      setError(`Messages must be ${MESSAGE_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      return;
    }

    setError(null);
    setIsSending(true);
    try {
      const response = await respondToConversation(createClient(), conversation.id, {
        content: trimmedContent,
      });
      setMessages((current) => chronologicalMessages([
        ...current,
        response.user_message,
        response.assistant_message,
      ]));
      setContent("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
        return;
      }
      if (cause instanceof ApiError && cause.status === 502) {
        setError("The assistant could not respond right now. Please try again.");
        return;
      }
      setError(cause instanceof ApiError && cause.status === 0
        ? "We could not reach DevStride. Check your connection and try again."
        : "Your message could not be sent. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="conversation-shell conversation-detail" aria-labelledby="conversation-title">
      <div className="conversation-detail-header">
        <Link href="/conversations" className="back-link">← All conversations</Link>
        <p className="eyebrow">{conversation.mode}</p>
        <h1 id="conversation-title">{conversation.title}</h1>
        <p className="muted">Your messages and assistant responses are saved in this conversation.</p>
      </div>

      <div className="message-history" aria-live="polite">
        {messages.length === 0 ? (
          <div className="message-empty">
            <h2>Start with a question</h2>
            <p className="muted">Ask something to begin this conversation.</p>
          </div>
        ) : messages.map((message) => (
          <article className={`message-bubble message-${message.role}`} key={message.id}>
            <p className="message-label">{message.role === "user" ? "You" : "Assistant"}</p>
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <form className="message-composer" onSubmit={handleSubmit}>
        <label htmlFor="message-content">Your message</label>
        <textarea
          id="message-content"
          value={content}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Ask a question or describe what you want to practise…"
          onChange={(event) => {
            setContent(event.target.value);
            setError(null);
          }}
          rows={5}
          disabled={isSending}
        />
        <p className="field-hint">{content.length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={isSending}>
          {isSending ? "Generating…" : "Send message"}
        </button>
      </form>
    </section>
  );
}
