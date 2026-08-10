export type ProgressMode = "general" | "mentor" | "interview" | "team";

export type ProgressSession = {
  id: string;
  title: string;
  mode: ProgressMode;
  interview_type: string | null;
  interview_focus: string | null;
  team_scenario: string | null;
  updated_at: string;
  message_count: number;
  has_messages: boolean;
  interview_started: boolean;
  interview_completed: boolean;
  has_final_assessment: boolean;
  summary_available: boolean;
};

export type ProgressSummary = {
  total_sessions: number;
  mentor_sessions: number;
  interview_sessions: number;
  general_sessions: number;
  team_sessions: number;
  recent_sessions: ProgressSession[];
};
