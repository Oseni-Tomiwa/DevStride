export type ConversationMode = "general" | "mentor" | "interview" | "team";
export type InterviewType = "technical" | "behavioral";
export type InterviewFocus =
  | "general_backend"
  | "apis"
  | "databases"
  | "javascript_node"
  | "python"
  | "system_design";
export type TeamScenario = "code_review" | "architecture_discussion" | "sprint_planning" | "debugging_incident" | "technical_decision";
export type TeamDifficulty = "guided" | "realistic" | "challenging";

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
  team_scenario?: TeamScenario;
  team_difficulty?: TeamDifficulty;
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

export type LiveInterviewSpikeResponse = {
  session_id: string;
  sdp_answer: string;
  status: "connected";
};

export type SessionSummary = {
  id: string;
  conversation_id: string;
  session_mode: "mentor" | "interview" | "team";
  summary: string;
  topics_covered: string[];
  strengths: string[];
  weaknesses: string[];
  recommended_next_steps: string[];
  concepts_practiced: string[] | null;
  exercises_completed: string[] | null;
  correctness_rating: number | null;
  clarity_rating: number | null;
  depth_rating: number | null;
  reasoning_rating: number | null;
  created_at: string;
  updated_at: string;
};
