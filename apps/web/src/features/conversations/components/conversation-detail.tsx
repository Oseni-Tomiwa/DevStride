"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import { createConversationSummary, getConversationSummary, retryConversationMessage, startInterview, streamConversation } from "../api";
import { conversationDisplayTitle } from "../title";
import type { Conversation, Message, SessionSummary } from "../types";
import { AssistantMarkdown } from "./assistant-markdown";
import { SessionSummaryView } from "./session-summary-view";

const MESSAGE_MAX_LENGTH = 20_000;

type ConversationDetailProps = {
  conversation: Conversation;
  initialMessages: Message[];
  initialSummary?: SessionSummary | null;
  mentorContext?: { currentLevel: string; targetRole: string };
  interviewContext?: { interviewType: string; interviewFocus: string | null; currentLevel: string; targetRole: string };
};
type SseEvent = { event: string; data: unknown };
type SseRecord = Record<string, unknown>;
type StreamTerminalState = "active" | "completed" | "failed" | "cancelled";

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
      for (const frame of frames) if (frame.trim()) yield parseSseFrame(frame);
      if (done) break;
    }
    if (buffer.trim()) yield parseSseFrame(buffer);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The request may already have been aborted or closed by the browser.
    }
    reader.releaseLock();
  }
}

export function ConversationDetail({ conversation, initialMessages, initialSummary = null, mentorContext, interviewContext }: ConversationDetailProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(() => chronologicalMessages(initialMessages));
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryMessageId, setRetryMessageId] = useState<string | null>(null);
  const [interviewKickoffPending, setInterviewKickoffPending] = useState(
    conversation.mode === "interview" && initialMessages.length === 0,
  );
  const [interviewKickoffFailed, setInterviewKickoffFailed] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(initialSummary);
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [sessionEndRequested, setSessionEndRequested] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);
  const persistedUserMessageIdRef = useRef<string | null>(null);
  const interviewKickoffRequestedRef = useRef(false);
  const unmountCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages]);

  useEffect(() => {
    mountedRef.current = true;
    if (unmountCleanupTimerRef.current !== null) {
      clearTimeout(unmountCleanupTimerRef.current);
      unmountCleanupTimerRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      unmountCleanupTimerRef.current = setTimeout(() => {
        unmountCleanupTimerRef.current = null;
        if (!mountedRef.current) {
          generationIdRef.current += 1;
          abortControllerRef.current?.abort();
          abortControllerRef.current = null;
        }
      }, 0);
    };
  }, []);

  async function runGeneration(
    request: (signal: AbortSignal) => Promise<Response>,
    onCompleted?: () => void,
  ) {
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setIsSending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const temporaryAssistantId = `streaming-${Date.now()}`;
    let terminal: StreamTerminalState = "active";
    const terminalState = () => terminal;

    const isCurrentGeneration = () => generationIdRef.current === generationId;
    const clearGeneration = () => {
      if (!mountedRef.current || !isCurrentGeneration()) return;
      abortControllerRef.current = null;
      setIsSending(false);
    };

    const removeTemporaryAssistant = () => {
      if (mountedRef.current) setMessages((current) => current.filter((message) => message.id !== temporaryAssistantId));
    };

    const finish = (state: Exclude<StreamTerminalState, "active">) => {
      if (terminal !== "active") return false;
      terminal = state;
      if (state !== "completed") removeTemporaryAssistant();
      clearGeneration();
      return true;
    };

    try {
      const response = await request(controller.signal);
      if (!response.body) throw new Error("The response did not include a stream.");

      for await (const event of readSseEvents(response.body)) {
        if (!mountedRef.current || !isCurrentGeneration()) break;
        if (event.event === "user_message") {
          const message = asMessage(event.data);
          persistedUserMessageIdRef.current = message.id;
          setRetryMessageId(message.id);
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
          if (terminal !== "active") break;
          setRetryMessageId(null);
          setMessages((current) => chronologicalMessages([...current.filter((item) => item.id !== temporaryAssistantId && item.id !== message.id), message]));
          onCompleted?.();
          finish("completed");
          // assistant_complete is authoritative. Do not wait forever for done.
          clearGeneration();
          break;
        } else if (event.event === "error") {
          if (terminal !== "active") break;
          const payload = asRecord(event.data);
          setError(typeof payload.message === "string" ? payload.message : "Assistant generation failed. Please try again.");
          finish("failed");
          break;
        } else if (event.event === "done") {
          if (terminal !== "active") break;
          setError("The assistant connection ended before completion. Please try again.");
          finish("failed");
          break;
        } else if (event.event === "interview_pending") {
          if (terminal !== "active") break;
          finish("completed");
          break;
        }
      }

      if (terminal === "active" && isCurrentGeneration()) {
        setError("The assistant connection was interrupted. Please try again.");
        finish("failed");
      }
    } catch (cause) {
      if (!isCurrentGeneration()) return;
      if (terminalState() === "completed") return;
      if (terminalState() === "cancelled") return;
      if (cause instanceof DOMException && cause.name === "AbortError") {
        if (mountedRef.current) setError("The assistant connection was interrupted. Please try again.");
      } else if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else if (cause instanceof ApiError && cause.status === 404) {
        setError("This conversation or message could not be found.");
      } else if (cause instanceof ApiError && cause.status === 409) {
        setError("This message has already been answered and cannot be retried.");
      } else if (cause instanceof ApiError && cause.status === 503) {
        setError("Assistant generation is currently unavailable.");
      } else if (cause instanceof ApiError && cause.status === 0) {
        setError("We could not reach DevStride. Check your connection and try again.");
      } else if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "The assistant could not respond. Please try again.");
      }
      finish("failed");
    } finally {
      if (terminal === "active" && isCurrentGeneration()) {
        setError("The assistant connection was interrupted. Please try again.");
        finish("failed");
      }
      clearGeneration();
    }
  }

  function stopGenerating() {
    if (!abortControllerRef.current) return;
    const userMessageId = persistedUserMessageIdRef.current;
    if (userMessageId) setRetryMessageId(userMessageId);
    generationIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages((current) => current.filter((message) => !message.id.startsWith("streaming-")));
    setError(userMessageId ? "Generation stopped. You can retry this response." : "Generation stopped.");
    setIsSending(false);
  }

  async function submitMessage(rawContent: string) {
    const trimmedContent = rawContent.trim();
    if (!trimmedContent) { setError("Write a message before sending."); return; }
    if (trimmedContent.length > MESSAGE_MAX_LENGTH) {
      setError(`Messages must be ${MESSAGE_MAX_LENGTH.toLocaleString()} characters or fewer.`);
      return;
    }
    persistedUserMessageIdRef.current = null;
    setRetryMessageId(null);
    setError(null);
    await runGeneration((signal) => streamConversation(createClient(), conversation.id, { content: trimmedContent }, signal));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage(content);
  }

  async function handleRetry() {
    if (!retryMessageId || isSending) return;
    setError(null);
    await runGeneration((signal) => retryConversationMessage(createClient(), conversation.id, retryMessageId, signal));
  }

  async function refreshSummary() {
    setSummaryPending(true);
    setSummaryError(null);
    try {
      setSummary(await getConversationSummary(createClient(), conversation.id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setSummary(null);
      } else if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else {
        setSummaryError("The session summary is not available yet.");
      }
    } finally {
      setSummaryPending(false);
    }
  }

  async function generateSummary() {
    setSummaryPending(true);
    setSummaryError(null);
    try {
      setSummary(await createConversationSummary(createClient(), conversation.id));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.push("/login");
      } else if (cause instanceof ApiError && cause.status === 409) {
        setSummaryError("Summaries are only available for Mentor and Interview sessions.");
      } else {
        setSummaryError("The session summary could not be generated. Please try again.");
      }
    } finally {
      setSummaryPending(false);
    }
  }

  async function startInterviewKickoff() {
    setError(null);
    setInterviewKickoffFailed(false);
    setInterviewKickoffPending(true);
    let completed = false;
    try {
      await runGeneration(
        (signal) => startInterview(createClient(), conversation.id, signal),
        () => { completed = true; },
      );
    } finally {
      if (mountedRef.current) {
        setInterviewKickoffPending(false);
        setInterviewKickoffFailed(!completed);
      }
    }
  }

  function retryInterviewKickoff() {
    void startInterviewKickoff();
  }

  useEffect(() => {
    if (
      conversation.mode === "interview" &&
      initialMessages.length === 0 &&
      !interviewKickoffRequestedRef.current
    ) {
      interviewKickoffRequestedRef.current = true;
      void startInterviewKickoff();
    }
    // The server-provided empty history is the idempotent kickoff condition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.mode, initialMessages.length]);

  async function endInterview() {
    setSessionEndRequested(true);
    await submitMessage("End the interview and provide my final practice assessment with strengths, areas to improve, gaps, and next practice areas. Include practice ratings for correctness, clarity, depth, and reasoning from 1 to 5, and clearly state that they are not hiring predictions.");
    await refreshSummary();
  }

  async function endMentorSession() {
    setSessionEndRequested(true);
    await submitMessage("End the mentor session and provide my practice summary with topics covered, strengths observed, areas to improve, and recommended next steps. Keep observations grounded in this session.");
    await refreshSummary();
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const quickActions = [
    { label: "Explain simpler", content: "Explain the previous concept more simply." },
    { label: "Give an example", content: "Give me a practical example of the concept we are currently discussing." },
    { label: "Quiz me", content: "Quiz me on the topic we are currently discussing. Ask one question at a time." },
    { label: "Give me an exercise", content: "Give me a practical exercise based on what we are currently learning. Do not give the solution immediately." },
    { label: "Challenge my answer", content: "Challenge my most recent answer. Point out weak assumptions and ask me to improve it." },
  ];
  const profileLabel = (value: string) => value.replaceAll("_", " ");
  const interviewTypeLabel = interviewContext?.interviewType === "behavioral" ? "Behavioral" : "Technical";

  const displayTitle = conversationDisplayTitle(conversation, messages);

  return (
    <section className="conversation-shell conversation-detail" aria-labelledby="conversation-title">
      <div className="conversation-detail-header">
        <Link href="/conversations" className="back-link">← All conversations</Link>
        <p className="eyebrow">{conversation.mode === "mentor" ? "Mentor Mode" : conversation.mode === "interview" ? "Interview Mode" : conversation.mode}</p>
        <h1 id="conversation-title">{displayTitle}</h1>
        <p className="muted">Your messages and assistant responses are saved in this conversation.</p>
        {conversation.mode === "mentor" && mentorContext && (
          <p className="conversation-context">
            {profileLabel(mentorContext.targetRole)} · {profileLabel(mentorContext.currentLevel)}
          </p>
        )}
        {conversation.mode === "interview" && interviewContext && (
          <p className="conversation-context">
            {interviewTypeLabel} · {profileLabel(interviewContext.targetRole)} · {profileLabel(interviewContext.currentLevel)}
            {interviewContext.interviewFocus && ` · ${profileLabel(interviewContext.interviewFocus)}`}
          </p>
        )}
      </div>
      <div className="message-history" aria-live="polite">
      {messages.length === 0 ? <div className="message-empty">
        {conversation.mode === "interview" ? (
          interviewKickoffPending ? (
            <><h2>Your interviewer is preparing the first question…</h2><p className="muted">Your interview will begin in a moment.</p></>
          ) : interviewKickoffFailed ? (
            <><h2>Interview could not start</h2><p className="muted">{error ?? "We could not prepare the first question."}</p><button type="button" onClick={retryInterviewKickoff}>Retry starting interview</button></>
          ) : (
            <><h2>Your interviewer is preparing the first question…</h2><p className="muted">Refresh to check the interview status.</p></>
          )
        ) : (
          <><h2>Start with a question</h2><p className="muted">Ask something to begin this conversation.</p></>
        )}
      </div> : messages.map((message) => (
          <article className={`message-bubble message-${message.role}`} key={message.id}>
            <p className="message-label">{message.role === "user" ? "You" : "DevStride assistant"}</p>
          {message.role === "assistant" ? <AssistantMarkdown content={message.content} /> : <p className="message-content">{message.content}</p>}
          </article>
        ))}
        <div ref={historyEndRef} aria-hidden="true" />
      </div>
      {conversation.mode === "mentor" && (
        <div className="mentor-actions" aria-label="Mentor quick actions">
          {quickActions.map((action) => (
            <button
              type="button"
              className="button-secondary"
              key={action.label}
              disabled={isSending}
              onClick={() => void submitMessage(action.content)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {conversation.mode === "interview" && messages.some((message) => message.role === "assistant" && !message.id.startsWith("streaming-")) && (
        <div className="interview-actions">
          <button type="button" className="button-secondary" onClick={() => void endInterview()} disabled={isSending || interviewKickoffPending}>
            End interview
          </button>
        </div>
      )}
      {conversation.mode === "mentor" && messages.some((message) => message.role === "assistant" && !message.id.startsWith("streaming-")) && !summary && (
        <div className="session-end-actions">
          <button type="button" className="button-secondary" onClick={() => void endMentorSession()} disabled={isSending || summaryPending}>
            {sessionEndRequested ? "Updating summary…" : "End Mentor Session"}
          </button>
        </div>
      )}
      {sessionEndRequested && !summary && !summaryPending && (
        <div className="generation-error" role="alert">
          <p>{summaryError ?? "The session summary is not available yet."}</p>
          <button type="button" className="button-secondary" onClick={() => void generateSummary()}>Retry summary</button>
        </div>
      )}
      {summary && <SessionSummaryView summary={summary} />}
      <form className="message-composer" onSubmit={handleSubmit}>
        <label htmlFor="message-content">Your message</label>
        <textarea id="message-content" value={content} maxLength={MESSAGE_MAX_LENGTH} placeholder="Ask a question or describe what you want to practise…" onChange={(event) => { setContent(event.target.value); setError(null); }} onKeyDown={handleComposerKeyDown} rows={4} disabled={isSending} />
        <p className="field-hint">Enter to send · Shift+Enter for a new line · {content.length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}</p>
        {error && <div className="generation-error" role="alert"><p>{error}</p>{retryMessageId && !isSending && <button type="button" className="button-secondary" onClick={() => void handleRetry()}>Retry</button>}</div>}
        {isSending ? <button type="button" className="button-secondary" onClick={stopGenerating}>Stop generating</button> : <button type="submit">Send message</button>}
      </form>
    </section>
  );
}
