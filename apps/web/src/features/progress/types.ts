export type ProgressMode = "general" | "mentor" | "interview";

export type ProgressSession = {
  id: string;
  title: string;
  mode: ProgressMode;
  interview_type: string | null;
  interview_focus: string | null;
  updated_at: string;
  message_count: number;
  has_messages: boolean;
  interview_started: boolean;
  interview_completed: boolean;
  has_final_assessment: boolean;
};

export type ProgressSummary = {
  total_sessions: number;
  mentor_sessions: number;
  interview_sessions: number;
  general_sessions: number;
  recent_sessions: ProgressSession[];
};
