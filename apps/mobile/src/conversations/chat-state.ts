import type { Message } from "./contracts";

export type ChatStatus =
  | "loading_history"
  | "ready"
  | "sending"
  | "streaming"
  | "completed"
  | "failed_retryable"
  | "reconciling"
  | "unauthorized";

export type ChatError = {
  code: string;
  message: string;
};

export type ChatState = {
  status: ChatStatus;
  messages: Message[];
  assistantDraft: string;
  pendingUserMessageId: string | null;
  retryMessageId: string | null;
  error: ChatError | null;
};

export type ChatAction =
  | { type: "history_loaded"; messages: Message[] }
  | { type: "send_started" }
  | { type: "retry_started"; messageId: string }
  | { type: "user_message"; message: Message }
  | { type: "assistant_delta"; delta: string }
  | { type: "assistant_complete"; message: Message }
  | { type: "server_error"; code: string; message: string }
  | { type: "done_without_completion" }
  | { type: "stream_interrupted" }
  | { type: "cancelled" }
  | { type: "protocol_error" }
  | { type: "stream_ended" }
  | { type: "reconciliation_failed"; message: string }
  | { type: "reconciled"; messages: Message[] }
  | { type: "unauthorized" };

export const initialChatState: ChatState = {
  status: "loading_history",
  messages: [],
  assistantDraft: "",
  pendingUserMessageId: null,
  retryMessageId: null,
  error: null,
};

function upsertMessage(messages: Message[], message: Message): Message[] {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) {
    return [...messages, message];
  }
  const next = [...messages];
  next[index] = message;
  return next;
}

function reconcile(state: ChatState, messages: Message[]): ChatState {
  const knownIds = new Set(state.messages.map((message) => message.id));
  const newlyPersistedUser = [...messages]
    .reverse()
    .find((message) => message.role === "user" && !knownIds.has(message.id));
  const pendingId = state.pendingUserMessageId ?? newlyPersistedUser?.id ?? null;
  if (!pendingId) {
    return {
      ...state,
      status: "ready",
      messages,
      assistantDraft: "",
      retryMessageId: null,
      error: null,
    };
  }
  const userIndex = messages.findIndex((message) => message.id === pendingId);
  if (userIndex === -1) {
    return {
      ...state,
      status: "ready",
      messages,
      assistantDraft: "",
      pendingUserMessageId: null,
      retryMessageId: null,
      error: null,
    };
  }
  const hasAssistantAfter = messages.slice(userIndex + 1).some((message) => message.role === "assistant");
  return {
    ...state,
    status: hasAssistantAfter ? "completed" : "failed_retryable",
    messages,
    assistantDraft: "",
    pendingUserMessageId: hasAssistantAfter ? null : pendingId,
    retryMessageId: hasAssistantAfter ? null : pendingId,
    error: null,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "history_loaded":
      return { ...initialChatState, status: "ready", messages: action.messages };
    case "send_started":
      return {
        ...state,
        status: "sending",
        assistantDraft: "",
        pendingUserMessageId: null,
        retryMessageId: null,
        error: null,
      };
    case "retry_started":
      return {
        ...state,
        status: "sending",
        assistantDraft: "",
        pendingUserMessageId: action.messageId,
        retryMessageId: null,
        error: null,
      };
    case "user_message":
      return {
        ...state,
        status: "streaming",
        messages: upsertMessage(state.messages, action.message),
        pendingUserMessageId: action.message.id,
      };
    case "assistant_delta":
      return {
        ...state,
        status: "streaming",
        assistantDraft: state.assistantDraft + action.delta,
      };
    case "assistant_complete":
      return {
        ...state,
        status: "completed",
        messages: upsertMessage(state.messages, action.message),
        assistantDraft: "",
        pendingUserMessageId: null,
        retryMessageId: null,
        error: null,
      };
    case "server_error":
      return {
        ...state,
        status: state.pendingUserMessageId ? "failed_retryable" : "ready",
        assistantDraft: "",
        retryMessageId: state.pendingUserMessageId,
        error: { code: action.code, message: action.message },
      };
    case "done_without_completion":
    case "stream_interrupted":
    case "cancelled":
    case "protocol_error":
      return {
        ...state,
        status: "reconciling",
        assistantDraft: "",
        retryMessageId: null,
      };
    case "stream_ended":
      if (state.status === "completed" || state.status === "failed_retryable") {
        return state;
      }
      return {
        ...state,
        status: "reconciling",
        assistantDraft: "",
        retryMessageId: null,
      };
    case "reconciliation_failed":
      return {
        ...state,
        status: "reconciling",
        assistantDraft: "",
        retryMessageId: null,
        error: { code: "reconciliation_failed", message: action.message },
      };
    case "reconciled":
      return reconcile(state, action.messages);
    case "unauthorized":
      return {
        ...state,
        status: "unauthorized",
        assistantDraft: "",
        pendingUserMessageId: null,
        retryMessageId: null,
        error: null,
      };
  }
}
