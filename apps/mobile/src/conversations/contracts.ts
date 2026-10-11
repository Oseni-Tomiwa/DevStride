export const conversationModes = ["general", "mentor", "interview", "team"] as const;

export type ConversationMode = (typeof conversationModes)[number];

export type Conversation = {
  id: string;
  title: string;
  mode: string;
  persona: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type GeneralConversationCreateRequest = {
  title: string;
  mode: "general";
};

export type MessageCreateRequest = {
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

export function isConversation(value: unknown): value is Conversation {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    typeof value.title === "string" &&
    typeof value.mode === "string" &&
    isNullableString(value.persona) &&
    typeof value.status === "string" &&
    isRecord(value.metadata) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isConversationList(value: unknown): value is Conversation[] {
  return Array.isArray(value) && value.every(isConversation);
}

export function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    isUuid(value.conversation_id) &&
    typeof value.role === "string" &&
    typeof value.content === "string" &&
    isNullableString(value.provider) &&
    isNullableString(value.model) &&
    isNullableInteger(value.input_tokens) &&
    isNullableInteger(value.output_tokens) &&
    isNullableInteger(value.latency_ms) &&
    isRecord(value.metadata) &&
    isDateTime(value.created_at)
  );
}

export function isMessageList(value: unknown): value is Message[] {
  return Array.isArray(value) && value.every(isMessage);
}

function requiredTrimmedString(value: string, name: string, maxLength: number): string {
  if (Array.from(value).length > maxLength) {
    throw new Error(`${name} must be at most ${maxLength} characters.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must not be blank.`);
  }
  return trimmed;
}

export function createGeneralConversationInput(title: string): GeneralConversationCreateRequest {
  return {
    title: requiredTrimmedString(title, "title", 200),
    mode: "general",
  };
}

export function createMessageInput(content: string): MessageCreateRequest {
  return {
    content: requiredTrimmedString(content, "content", 20_000),
  };
}
