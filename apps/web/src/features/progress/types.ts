export type ProgressMode = "general" | "mentor" | "interview" | "team";
export type StructuredProgressMode = Exclude<ProgressMode, "general">;
export type RecommendationActivity = "continue" | StructuredProgressMode;

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
  user_turns: number;
  practiced: boolean;
  structured_completed: boolean;
};

export type ModeBreakdown = Record<ProgressMode, number>;

export type ProgressActivity = {
  practiced_sessions: number;
  completed_sessions: number;
  user_turns: number;
  practiced_sessions_last_30_days: number;
  mode_breakdown: ModeBreakdown;
};

export type ContinuePractice = {
  conversation_id: string;
  title: string;
  mode: ProgressMode;
  last_activity_at: string;
  interview_type: string | null;
  interview_focus: string | null;
  team_scenario: string | null;
};

export type CurrentFocus = {
  basis: "goal_focus_area" | "saved_goal" | "saved_weakness" | "communication_goal";
  label: string;
  goal_id?: string | null;
  focus_area_id?: string | null;
};

export type ProgressEvidence = {
  text: string;
  occurrences: number;
  latest_at: string;
  modes: StructuredProgressMode[];
  conversation_id: string;
};

export type RatingHistoryItem = {
  conversation_id: string;
  observed_at: string;
  interview_type: string | null;
  interview_focus: string | null;
  correctness: number | null;
  clarity: number | null;
  depth: number | null;
  reasoning: number | null;
};

export type RecommendationAction = {
  kind: "continue_conversation" | "start_practice" | "review_goal";
  mode: ProgressMode;
  conversation_id: string | null;
  goal_id?: string | null;
  focus_area_id?: string | null;
  interview_type: string | null;
  interview_focus: string | null;
  team_scenario: string | null;
  team_difficulty?: string | null;
};

export type ProgressRecommendation = {
  activity: RecommendationActivity;
  title: string;
  reason: string;
  evidence: string[];
  action: RecommendationAction;
};

export type ProgressSummary = {
  total_sessions: number;
  mentor_sessions: number;
  interview_sessions: number;
  general_sessions: number;
  team_sessions: number;
  recent_sessions: ProgressSession[];
  activity: ProgressActivity;
  continue_practice: ContinuePractice | null;
  current_focus: CurrentFocus | null;
  recent_strength: ProgressEvidence | null;
  recent_weakness: ProgressEvidence | null;
  recurring_strengths: ProgressEvidence[];
  recurring_weaknesses: ProgressEvidence[];
  rating_history: RatingHistoryItem[];
  recommendation: ProgressRecommendation;
  goal_progress?: import("../goals/types").GoalProgress | null;
};
