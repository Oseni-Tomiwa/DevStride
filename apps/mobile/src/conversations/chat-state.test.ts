import { userMessageFixture } from "./test-fixtures";
import { chatReducer, initialChatState } from "./chat-state";

const assistantMessage = {
  ...userMessageFixture,
  id: "33333333-3333-4333-8333-333333333333",
  role: "assistant",
  content: "Use a versioned URL.",
  provider: "openai",
  model: "gpt-test",
  input_tokens: 20,
  output_tokens: 6,
  latency_ms: 150,
  created_at: "2026-09-18T08:01:02Z",
};

describe("chatReducer", () => {
  it("loads persisted history into a ready state", () => {
    expect(
      chatReducer(initialChatState, { type: "history_loaded", messages: [userMessageFixture] }),
    ).toMatchObject({ status: "ready", messages: [userMessageFixture] });
  });

  it("streams one user message and a temporary assistant draft until authoritative completion", () => {
    let state = chatReducer(initialChatState, { type: "history_loaded", messages: [] });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "user_message", message: userMessageFixture });
    state = chatReducer(state, { type: "assistant_delta", delta: "Use a " });
    state = chatReducer(state, { type: "assistant_delta", delta: "versioned URL." });

    expect(state).toMatchObject({
      status: "streaming",
      assistantDraft: "Use a versioned URL.",
      pendingUserMessageId: userMessageFixture.id,
      messages: [userMessageFixture],
    });

    state = chatReducer(state, { type: "assistant_complete", message: assistantMessage });
    expect(state).toMatchObject({
      status: "completed",
      assistantDraft: "",
      pendingUserMessageId: null,
      messages: [userMessageFixture, assistantMessage],
    });
  });

  it("deduplicates replayed persisted messages by id", () => {
    let state = chatReducer(initialChatState, { type: "history_loaded", messages: [userMessageFixture] });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "user_message", message: userMessageFixture });
    expect(state.messages).toEqual([userMessageFixture]);
  });

  it.each(["done_without_completion", "stream_interrupted", "cancelled", "protocol_error"] as const)(
    "requires reconciliation after ambiguous %s",
    (type) => {
      let state = chatReducer(initialChatState, { type: "history_loaded", messages: [] });
      state = chatReducer(state, { type: "send_started" });
      state = chatReducer(state, { type: "user_message", message: userMessageFixture });
      state = chatReducer(state, { type });
      expect(state).toMatchObject({
        status: "reconciling",
        retryMessageId: null,
        pendingUserMessageId: userMessageFixture.id,
      });
    },
  );

  it("recovers an assistant persisted during an ambiguous disconnect", () => {
    const interrupted = {
      ...initialChatState,
      status: "reconciling" as const,
      pendingUserMessageId: userMessageFixture.id,
    };
    const state = chatReducer(interrupted, {
      type: "reconciled",
      messages: [userMessageFixture, assistantMessage],
    });
    expect(state).toMatchObject({
      status: "completed",
      messages: [userMessageFixture, assistantMessage],
      retryMessageId: null,
    });
  });

  it("offers retry only after reconciliation proves the user message is unanswered", () => {
    const interrupted = {
      ...initialChatState,
      status: "reconciling" as const,
      pendingUserMessageId: userMessageFixture.id,
    };
    const state = chatReducer(interrupted, {
      type: "reconciled",
      messages: [userMessageFixture],
    });
    expect(state).toMatchObject({
      status: "failed_retryable",
      retryMessageId: userMessageFixture.id,
    });
  });

  it("never offers retry when reconciliation itself fails", () => {
    const reconciling = {
      ...initialChatState,
      status: "reconciling" as const,
      pendingUserMessageId: userMessageFixture.id,
    };
    const state = chatReducer(reconciling, {
      type: "reconciliation_failed",
      message: "Couldn’t confirm saved messages.",
    });
    expect(state).toMatchObject({
      status: "reconciling",
      pendingUserMessageId: userMessageFixture.id,
      retryMessageId: null,
      error: { code: "reconciliation_failed", message: "Couldn’t confirm saved messages." },
    });
  });

  it("does not offer retry when reconciliation cannot find a persisted user message", () => {
    const interrupted = {
      ...initialChatState,
      status: "reconciling" as const,
      pendingUserMessageId: userMessageFixture.id,
    };
    const state = chatReducer(interrupted, { type: "reconciled", messages: [] });
    expect(state).toMatchObject({ status: "ready", retryMessageId: null });
  });

  it("finds a newly persisted unanswered user message when interruption preceded its event", () => {
    const previousMessage = {
      ...assistantMessage,
      id: "44444444-4444-4444-8444-444444444444",
      created_at: "2026-09-18T07:59:00Z",
    };
    let state = chatReducer(initialChatState, {
      type: "history_loaded",
      messages: [previousMessage],
    });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "stream_interrupted" });
    state = chatReducer(state, {
      type: "reconciled",
      messages: [previousMessage, userMessageFixture],
    });
    expect(state).toMatchObject({
      status: "failed_retryable",
      pendingUserMessageId: userMessageFixture.id,
      retryMessageId: userMessageFixture.id,
    });
  });

  it("treats completion as authoritative when done or EOF follows it", () => {
    let state = chatReducer(initialChatState, { type: "history_loaded", messages: [] });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "user_message", message: userMessageFixture });
    state = chatReducer(state, { type: "assistant_complete", message: assistantMessage });
    expect(chatReducer(state, { type: "stream_ended" })).toEqual(state);
  });

  it("requires reconciliation when done or EOF arrives before assistant completion", () => {
    let state = chatReducer(initialChatState, { type: "history_loaded", messages: [] });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "user_message", message: userMessageFixture });
    expect(chatReducer(state, { type: "stream_ended" })).toMatchObject({
      status: "reconciling",
      retryMessageId: null,
    });
  });

  it("does not replace an explicit server failure when its trailing done event arrives", () => {
    let state = chatReducer(initialChatState, { type: "history_loaded", messages: [] });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "user_message", message: userMessageFixture });
    state = chatReducer(state, {
      type: "server_error",
      code: "generation_failed",
      message: "Try again",
    });
    expect(chatReducer(state, { type: "stream_ended" })).toEqual(state);
  });

  it("allows retry after an explicit server generation error", () => {
    let state = chatReducer(initialChatState, { type: "history_loaded", messages: [] });
    state = chatReducer(state, { type: "send_started" });
    state = chatReducer(state, { type: "user_message", message: userMessageFixture });
    state = chatReducer(state, {
      type: "server_error",
      code: "generation_failed",
      message: "Try again",
    });
    expect(state).toMatchObject({
      status: "failed_retryable",
      retryMessageId: userMessageFixture.id,
      error: { code: "generation_failed", message: "Try again" },
    });
  });

  it("makes unauthorized terminal without retry or automatic resend state", () => {
    const state = chatReducer(
      { ...initialChatState, status: "sending", pendingUserMessageId: userMessageFixture.id },
      { type: "unauthorized" },
    );
    expect(state).toMatchObject({
      status: "unauthorized",
      pendingUserMessageId: null,
      retryMessageId: null,
    });
  });
});
