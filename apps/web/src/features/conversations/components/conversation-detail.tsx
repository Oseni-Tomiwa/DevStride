"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { streamConversation } from "../api";
import type { Conversation, Message } from "../types";

const MESSAGE_MAX_LENGTH = 20_000;

type ConversationDetailProps = { conversation: Conversation; initialMessages: Message[] };
type SseEvent = { event: string; data: unknown };
type SseRecord = Record<string, unknown>;

function chronologicalMessages(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
}

function asRecord(value: unknown): SseRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Malformed stream payload");
  return value as SseRecord;
}

function asMessage(value: unknown): Message {
  const payload = asRecord(value);
  if (typeof payload.id !== "string" || typeof payload.conversation_id !== "string" || typeof payload.role !== "string" || typeof payload.content !== "string" || typeof payload.created_at !== "string") {
    throw new Error("Malformed message payload");
  }
  return payload as unknown as Message;
}

function parseSseFrame(frame: string): SseEvent {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) throw new Error("Malformed stream event");
  try {
    return { event, data: JSON.parse(data.join("\n")) as unknown };
  } catch {
    throw new Error("Malformed stream payload");
  }
}

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        if (frame.trim()) yield parseSseFrame(frame);
      }
      if (done) break;
    }
    if (buffer.trim()) yield parseSseFrame(buffer);
  } finally {
    reader.releaseLock();
  }
}

export function ConversationDetail({ conversation, initialMessages }: ConversationDetailProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(() => chronologicalMessages(initialMessages));
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages]);

  useEffect(() => () => {
    mountedRef.current = false;
    abortControllerRef.current?.abort();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) { setError("Write a message before sending."); return; }
    if (trimmedContent.length > MESSAGE_MAX_LENGTH) {
      setError(`Messages must be ${MESSAGE_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      return;
    }

    setError(null);
    setIsSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const temporaryAssistantId = `streaming-${Date.now()}`;
    let sawComplete = false;
    let sawDone = false;
    let streamError: string | null = null;

    const removeTemporaryAssistant = () => {
      if (!mountedRef.current) return;
      setMessages((current) => current.filter((message) => message.id !== temporaryAssistantId));
    };

    try {
      const response = await streamConversation(createClient(), conversation.id, { content: trimmedContent }, controller.signal);
      if (!response.body) throw new Error("The response did not include a stream.");

      for await (const event of readSseEvents(response.body)) {
        if (event.event === "user_message") {
          const message = asMessage(event.data);
          setMessages((current) => current.some((item) => item.id === message.id) ? current : chronologicalMessages([...current, message]));
          setContent("");
        } else if (event.event === "assistant_delta") {
          const payload = asRecord(event.data);
          if (typeof payload.delta !== "string") throw new Error("Malformed assistant delta");
          setMessages((current) => {
            const existing = current.find((message) => message.id === temporaryAssistantId);
            if (!existing) {
              return [...current, { id: temporaryAssistantId, conversation_id: conversation.id, role: "assistant", content: payload.delta as string, provider: null, model: null, input_tokens: null, output_tokens: null, latency_ms: null, metadata: {}, created_at: new Date().toISOString() }];
            }
            return current.map((message) => message.id === temporaryAssistantId ? { ...message, content: message.content + (payload.delta as string) } : message);
          });
        } else if (event.event === "assistant_complete") {
          const message = asMessage(event.data);
          sawComplete = true;
          setMessages((current) => chronologicalMessages([
            ...current.filter((item) => item.id !== temporaryAssistantId && item.id !== message.id),
            message,
          ]));
        } else if (event.event === "error") {
          const payload = asRecord(event.data);
          streamError = typeof payload.message === "string" ? payload.message : "Assistant generation failed. Please try again.";
          setError(streamError);
          removeTemporaryAssistant();
        } else if (event.event === "done") {
          sawDone = true;
        }
      }

      if (!sawComplete && !streamError && !sawDone) throw new Error("The assistant stream ended unexpectedly.");
      if (!sawComplete && !streamError) {
        removeTemporaryAssistant();
        setError("The assistant connection was interrupted. Please try again.");
      }
    } catch (cause) {
      removeTemporaryAssistant();
      if (cause instanceof DOMException && cause.name === "AbortError") {
        if (mountedRef.current) setError("Generation was stopped. You can try again.");
      } else if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else if (cause instanceof ApiError && cause.status === 404) {
        setError("This conversation could not be found.");
      } else if (cause instanceof ApiError && cause.status === 503) {
        setError("Assistant generation is currently unavailable.");
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError("We could not reach DevStride. Check your connection and try again.");
      } else {
        setError(cause instanceof Error ? cause.message : "The assistant could not respond. Please try again.");
      }
    } finally {
      abortControllerRef.current = null;
      if (mountedRef.current) setIsSending(false);
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
        {messages.length === 0 ? <div className="message-empty"><h2>Start with a question</h2><p className="muted">Ask something to begin this conversation.</p></div> : messages.map((message) => (
          <article className={`message-bubble message-${message.role}`} key={message.id}>
            <p className="message-label">{message.role === "user" ? "You" : "Assistant"}</p>
            <p>{message.content}</p>
          </article>
        ))}
        <div ref={historyEndRef} aria-hidden="true" />
      </div>
      <form className="message-composer" onSubmit={handleSubmit}>
        <label htmlFor="message-content">Your message</label>
        <textarea id="message-content" value={content} maxLength={MESSAGE_MAX_LENGTH} placeholder="Ask a question or describe what you want to practise…" onChange={(event) => { setContent(event.target.value); setError(null); }} rows={5} disabled={isSending} />
        <p className="field-hint">{content.length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={isSending}>{isSending ? "Generating…" : "Send message"}</button>
      </form>
    </section>
  );
}
