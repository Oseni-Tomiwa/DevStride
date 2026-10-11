export const conversationFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "API design",
  mode: "general",
  persona: null,
  status: "active",
  metadata: {},
  created_at: "2026-09-18T08:00:00Z",
  updated_at: "2026-09-18T08:05:00Z",
};

export const userMessageFixture = {
  id: "22222222-2222-4222-8222-222222222222",
  conversation_id: conversationFixture.id,
  role: "user",
  content: "How should I version this API?",
  provider: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  latency_ms: null,
  metadata: {},
  created_at: "2026-09-18T08:01:00Z",
};
