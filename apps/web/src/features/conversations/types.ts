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
  mode: string;
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
