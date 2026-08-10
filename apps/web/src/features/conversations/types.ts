export type ConversationMode = "general" | "mentor" | "interview";
export type InterviewType = "technical" | "behavioral";
export type InterviewFocus =
  | "general_backend"
  | "apis"
  | "databases"
  | "javascript_node"
  | "python"
  | "system_design";

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

export type CreateConversationInput = {
  title: string;
  mode: ConversationMode;
  interview_type?: InterviewType;
  interview_focus?: InterviewFocus;
};

export type RenameConversationInput = {
  title: string;
};

export type CreateUserMessageInput = {
  content: string;
};


export type RespondResponse = {
  user_message: Message;
  assistant_message: Message;
};
