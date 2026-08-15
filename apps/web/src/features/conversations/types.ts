export type ConversationMode = "general" | "mentor" | "interview" | "team";
export type InterviewType = "technical" | "behavioral";
export type InterviewTransport = "text" | "live_voice" | "video";
export type MentorTransport = "text" | "live_voice";
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
  interview_transport?: InterviewTransport;
  mentor_transport?: MentorTransport;
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

export type RealtimeSession = {
  client_secret: string;
  expires_at: number | null;
  model: string;
};

export type RealtimeTranscriptTurn = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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

export type PracticeReportContext = {
  title: string;
  status: "active" | "completed" | "archived";
};

export type PracticeReport = {
  conversation_id: string;
  mode: "mentor" | "interview" | "team";
  transport: string | null;
  completion_status: "completed" | "in_progress";
  completed_at: string | null;
  goal: PracticeReportContext | null;
  focus: PracticeReportContext | null;
  evidence_status: "available" | "insufficient" | "unavailable";
  summary: SessionSummary | null;
  analytics: LiveAnalytics | null;
  recommendation: import("../progress/types").ProgressRecommendation | null;
};

export type LiveAnalytics = {
  conversation_id: string;
  candidate_speaking_ms: number | null;
  interviewer_speaking_ms: number | null;
  candidate_talk_share: number | null;
  candidate_turn_count: number;
  interviewer_turn_count: number;
  average_candidate_response_ms: number | null;
  longest_candidate_response_ms: number | null;
  average_response_latency_ms: number | null;
  interruption_count: number;
  reconnect_count: number;
  mute_count: number;
  session_duration_ms: number | null;
  finalized_word_count: number;
  approximate_wpm: number | null;
  filler_word_count: number;
  filler_words_per_100: number | null;
};
