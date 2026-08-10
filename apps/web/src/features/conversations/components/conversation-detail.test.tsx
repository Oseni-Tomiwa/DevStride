import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../lib/api/client";
import { ConversationDetail } from "./conversation-detail";

const { push, retryConversationMessage, startInterview, streamConversation } = vi.hoisted(() => ({
  push: vi.fn(),
  retryConversationMessage: vi.fn(),
  startInterview: vi.fn(),
  streamConversation: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ retryConversationMessage, startInterview, streamConversation }));

const conversation = {
  id: "conversation-id",
  title: "Practice notes",
  mode: "general",
  persona: null,
  status: "active",
  metadata: {},
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-01T10:00:00Z",
};

const message = (
  id: string,
  content: string,
  created_at: string,
  role: "user" | "assistant" = "user",
) => ({
  id,
  conversation_id: conversation.id,
  role,
  content,
  provider: role === "assistant" ? "openai" : null,
  model: role === "assistant" ? "gpt-test" : null,
  input_tokens: null,
  output_tokens: null,
  latency_ms: null,
  metadata: {},
  created_at,
});

function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("ConversationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startInterview.mockResolvedValue(sseResponse([{ event: "interview_pending", data: {} }]));
  });

  it("renders persisted history chronologically", () => {
    render(<ConversationDetail conversation={conversation} initialMessages={[
      message("later", "Second", "2026-08-01T11:00:00Z", "assistant"),
      message("earlier", "First", "2026-08-01T10:00:00Z"),
    ]} />);

    const text = screen.getByRole("region").textContent ?? "";
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("DevStride assistant")).toBeInTheDocument();
  });

  it("derives a concise title from the first user message", () => {
    render(<ConversationDetail conversation={{ ...conversation, title: "New conversation" }} initialMessages={[
      message("first", "Explain what a REST API is in two sentences.", "2026-08-01T10:00:00Z"),
    ]} />);

    expect(screen.getByRole("heading", { name: "Explain what a REST API is in two sentences" })).toBeInTheDocument();
  });

  it("renders Mentor Mode context and quick actions", async () => {
    streamConversation.mockResolvedValue(sseResponse([{ event: "done", data: {} }]));
    render(<ConversationDetail
      conversation={{ ...conversation, mode: "mentor" }}
      initialMessages={[]}
      mentorContext={{ currentLevel: "junior", targetRole: "backend_engineer" }}
    />);

    expect(screen.getByText("Mentor Mode")).toBeInTheDocument();
    expect(screen.getByText("backend engineer · junior")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quiz me" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Explain simpler" }));

    await waitFor(() => expect(streamConversation).toHaveBeenCalledWith(
      {},
      "conversation-id",
      { content: "Explain the previous concept more simply." },
      expect.any(AbortSignal),
    ));
  });

  it("does not show Mentor Mode controls for general conversations", () => {
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    expect(screen.queryByText("Mentor Mode")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quiz me" })).not.toBeInTheDocument();
    expect(startInterview).not.toHaveBeenCalled();
  });

  it("automatically starts a new interview and renders the first question", async () => {
    const firstQuestion = message("first-question", "How would you design a versioned API?", "2026-08-01T12:00:00Z", "assistant");
    startInterview.mockResolvedValueOnce(sseResponse([
      { event: "assistant_delta", data: { delta: "How would you design a versioned API?" } },
      { event: "assistant_complete", data: firstQuestion },
    ]));
    render(<ConversationDetail
      conversation={{ ...conversation, mode: "interview" }}
      initialMessages={[]}
      interviewContext={{ interviewType: "technical", interviewFocus: "apis", currentLevel: "junior", targetRole: "backend_engineer" }}
    />);

    expect(screen.getByText("Your interviewer is preparing the first question…")).toBeInTheDocument();
    await waitFor(() => expect(startInterview).toHaveBeenCalledWith({}, "conversation-id", expect.any(AbortSignal)));
    expect(await screen.findByText("How would you design a versioned API?")).toBeInTheDocument();
    expect(screen.queryByText("Start with a question")).not.toBeInTheDocument();
  });

  it("starts kickoff exactly once under React Strict Mode", async () => {
    const firstQuestion = message("strict-question", "Tell me about API versioning.", "2026-08-01T12:00:00Z", "assistant");
    startInterview.mockResolvedValueOnce(sseResponse([
      { event: "assistant_complete", data: firstQuestion },
      { event: "done", data: {} },
    ]));

    render(
      <React.StrictMode>
        <ConversationDetail conversation={{ ...conversation, mode: "interview" }} initialMessages={[]} />
      </React.StrictMode>,
    );

    await waitFor(() => expect(startInterview).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Tell me about API versioning.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
  });

  it("does not restart an interview when persisted history is present after refresh", () => {
    render(<ConversationDetail
      conversation={{ ...conversation, mode: "interview" }}
      initialMessages={[message("first-question", "Persisted first question", "2026-08-01T12:00:00Z", "assistant")]}
    />);

    expect(screen.getByText("Persisted first question")).toBeInTheDocument();
    expect(startInterview).not.toHaveBeenCalled();
  });

  it("shows interview-specific retry state after kickoff failure", async () => {
    startInterview.mockRejectedValueOnce(new Error("kickoff failed"));
    render(<ConversationDetail conversation={{ ...conversation, mode: "interview" }} initialMessages={[]} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry starting interview" })).toBeInTheDocument());
    expect(screen.queryByText("Start with a question")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End interview" })).not.toBeInTheDocument();
  });

  it("does not offer End interview before an opening question persists", () => {
    startInterview.mockReturnValueOnce(new Promise(() => {}));
    render(<ConversationDetail conversation={{ ...conversation, mode: "interview" }} initialMessages={[]} />);

    expect(screen.queryByRole("button", { name: "End interview" })).not.toBeInTheDocument();
  });

  it("renders Interview Mode context and only interview controls", () => {
    render(<ConversationDetail
      conversation={{ ...conversation, mode: "interview" }}
      initialMessages={[message("started", "First question", "2026-08-01T12:00:00Z", "assistant")]}
      interviewContext={{ interviewType: "technical", interviewFocus: "apis", currentLevel: "junior", targetRole: "backend_engineer" }}
    />);

    expect(screen.getByText("Interview Mode")).toBeInTheDocument();
    expect(screen.getByText("Technical · backend engineer · junior · apis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End interview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quiz me" })).not.toBeInTheDocument();
  });

  it("sends the approved final-assessment instruction when ending an interview", async () => {
    streamConversation.mockResolvedValue(sseResponse([{ event: "done", data: {} }]));
    render(<ConversationDetail
      conversation={{ ...conversation, mode: "interview" }}
      initialMessages={[message("started", "First question", "2026-08-01T12:00:00Z", "assistant")]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "End interview" }));

    await waitFor(() => expect(streamConversation).toHaveBeenCalledWith(
      {},
      "conversation-id",
      { content: expect.stringContaining("End the interview") },
      expect.any(AbortSignal),
    ));
  });

  it("prevents blank submissions", () => {
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);

    expect(streamConversation).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Write a message before sending.");
  });

  it("streams and renders the persisted user and assistant messages", async () => {
    const userMessage = message("new-user", "A saved question", "2026-08-01T12:00:00Z");
    const assistantMessage = message("new-assistant", "A helpful answer", "2026-08-01T12:00:01Z", "assistant");
    streamConversation.mockResolvedValue(sseResponse([
      { event: "user_message", data: userMessage },
      { event: "assistant_delta", data: { delta: "A helpful " } },
      { event: "assistant_delta", data: { delta: "answer" } },
      { event: "assistant_complete", data: assistantMessage },
      { event: "done", data: {} },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "  A saved question  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(streamConversation).toHaveBeenCalledWith(
      {},
      "conversation-id",
      { content: "A saved question" },
      expect.any(AbortSignal),
    ));
    expect(screen.getByText("A saved question")).toBeInTheDocument();
    expect(screen.getByText("A helpful answer")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    expect(screen.getByLabelText("Your message")).toBeEnabled();
  });

  it("uses Markdown for streamed assistant content and keeps user content plain", async () => {
    const userMessage = message("markdown-user", "<b>my plain question</b>", "2026-08-01T12:00:00Z");
    const assistantMessage = message("markdown-assistant", "## Answer\n\nUse `fetch()`.", "2026-08-01T12:00:01Z", "assistant");
    streamConversation.mockResolvedValue(sseResponse([
      { event: "user_message", data: userMessage },
      { event: "assistant_delta", data: { delta: "## Answer\n\nUse `fetch()`." } },
      { event: "assistant_complete", data: assistantMessage },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("heading", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByText("fetch()")).toHaveClass("inline-code");
    expect(screen.getByText("<b>my plain question</b>")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "my plain question" })).not.toBeInTheDocument();
  });

  it("finishes on assistant_complete even when trailing done is absent", async () => {
    streamConversation.mockResolvedValue(sseResponse([
      { event: "user_message", data: message("new-user", "Question", "2026-08-01T12:00:00Z") },
      { event: "assistant_complete", data: message("new-assistant", "Final answer", "2026-08-01T12:00:01Z", "assistant") },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("Final answer")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
  });

  it("ignores duplicate terminal events after successful completion", async () => {
    streamConversation.mockResolvedValue(sseResponse([
      { event: "assistant_complete", data: message("new-assistant", "Final answer", "2026-08-01T12:00:01Z", "assistant") },
      { event: "assistant_complete", data: message("duplicate", "Duplicate answer", "2026-08-01T12:00:02Z", "assistant") },
      { event: "done", data: {} },
      { event: "done", data: {} },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("Final answer")).toBeInTheDocument());
    expect(screen.queryByText("Duplicate answer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("clears generation safely for a malformed stream", async () => {
    streamConversation.mockResolvedValue(sseResponse([
      { event: "user_message", data: message("new-user", "Question", "2026-08-01T12:00:00Z") },
      { event: "assistant_delta", data: { invalid: true } },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Malformed assistant delta"));
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
  });

  it("treats done without an assistant completion as an interrupted error", async () => {
    streamConversation.mockResolvedValue(sseResponse([{ event: "done", data: {} }]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ended before completion"));
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("disables duplicate submissions while generation is running", async () => {
    let resolveStream!: (value: Response) => void;
    streamConversation.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByRole("button", { name: "Stop generating" })).toBeInTheDocument();

    expect(streamConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Your message")).toBeDisabled();
    resolveStream(sseResponse([
      { event: "user_message", data: message("new-user", "Question", "2026-08-01T12:00:00Z") },
      { event: "assistant_complete", data: message("new-assistant", "Answer", "2026-08-01T12:00:01Z", "assistant") },
      { event: "done", data: {} },
    ]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
  });

  it("stops generation, removes partial assistant text, and keeps the user message", async () => {
    let enqueue!: (chunk: string) => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        enqueue = (chunk) => controller.enqueue(new TextEncoder().encode(chunk));
      },
    });
    streamConversation.mockResolvedValue(new Response(body, { status: 200 }));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    enqueue(`event: user_message\ndata: ${JSON.stringify(message("new-user", "Question", "2026-08-01T12:00:00Z"))}\n\n`);
    enqueue("event: assistant_delta\ndata: {\"delta\":\"Partial answer\"}\n\n");

    await waitFor(() => expect(screen.getByText("Partial answer")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));

    expect(screen.queryByText("Partial answer")).not.toBeInTheDocument();
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Generation stopped");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("shows a provider failure without creating fake assistant data", async () => {
    streamConversation.mockResolvedValue(sseResponse([
      { event: "user_message", data: message("new-user", "Question", "2026-08-01T12:00:00Z") },
      { event: "error", data: { code: "generation_failed", message: "Assistant generation failed." } },
      { event: "done", data: {} },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Assistant generation failed.");
    expect(screen.queryByText("Answer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("retries the persisted user message without sending duplicate content", async () => {
    const userMessage = message("new-user", "Question", "2026-08-01T12:00:00Z");
    streamConversation.mockResolvedValue(sseResponse([
      { event: "user_message", data: userMessage },
      { event: "error", data: { message: "Assistant generation failed." } },
      { event: "done", data: {} },
    ]));
    retryConversationMessage.mockResolvedValue(sseResponse([
      { event: "user_message", data: userMessage },
      { event: "assistant_delta", data: { delta: "Recovered answer" } },
      { event: "assistant_complete", data: message("new-assistant", "Recovered answer", "2026-08-01T12:00:01Z", "assistant") },
      { event: "done", data: {} },
    ]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(retryConversationMessage).toHaveBeenCalledWith(
      {},
      "conversation-id",
      "new-user",
      expect.any(AbortSignal),
    ));
    expect(screen.getByText("Recovered answer")).toBeInTheDocument();
    expect(screen.getAllByText("Question")).toHaveLength(1);
    expect(streamConversation.mock.calls[0][2]).toEqual({ content: "Question" });
  });

  it("uses Enter to submit and Shift+Enter for a newline", async () => {
    streamConversation.mockResolvedValue(sseResponse([{ event: "done", data: {} }]));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);
    const composer = screen.getByLabelText("Your message");

    fireEvent.change(composer, { target: { value: "Enter message" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(streamConversation).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(streamConversation).toHaveBeenCalledTimes(1));
  });

  it("redirects to login when the authenticated stream fails", async () => {
    streamConversation.mockRejectedValue(new ApiError("unauthorized", 401));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
