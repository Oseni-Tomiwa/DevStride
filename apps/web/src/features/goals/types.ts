import type {
  InterviewFocus,
  InterviewType,
  TeamDifficulty,
  TeamScenario,
} from "../conversations/types";

export type GoalType = "interview_preparation" | "technical_growth" | "communication" | "custom";
export type GoalStatus = "active" | "completed" | "archived";
export type FocusAreaStatus = "active" | "completed" | "archived";
export type PracticeMode = "mentor" | "interview" | "team";

export type PracticeConfig =
  | Record<string, never>
  | { interview_type: InterviewType; interview_focus?: InterviewFocus | null }
  | { team_scenario: TeamScenario; team_difficulty: TeamDifficulty };

export type FocusArea = {
  id: string;
  goal_id: string;
  title: string;
  description: string | null;
  practice_mode: PracticeMode;
  practice_config: PracticeConfig;
  position: number;
  status: FocusAreaStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  status: GoalStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  focus_areas: FocusArea[];
  evidence: string[];
  action: {
    kind: "continue_conversation" | "start_practice" | "review_goal";
    mode: "general" | PracticeMode;
    conversation_id: string | null;
    goal_id: string | null;
    focus_area_id: string | null;
    interview_type: InterviewType | null;
    interview_focus: InterviewFocus | null;
    team_scenario: TeamScenario | null;
    team_difficulty: TeamDifficulty | null;
  };
};

export type FocusAreaDraft = {
  title: string;
  description: string | null;
  practice_mode: PracticeMode;
  practice_config: PracticeConfig;
};

export type PlanPreviewSuggestion = FocusAreaDraft & {
  suggested_position: number;
  source: "template" | "memory";
  reason: string;
};

export type PlanPreview = {
  heading: string;
  basis: string;
  goal_draft: { title: string; description: string | null; goal_type: GoalType };
  template_suggestions: PlanPreviewSuggestion[];
  memory_suggestions: PlanPreviewSuggestion[];
};

export type GoalProgress = {
  goal_id: string;
  title: string;
  status: GoalStatus;
  total_focus_areas: number;
  active_focus_areas: number;
  completed_focus_areas: number;
  archived_focus_areas: number;
  linked_practiced_sessions: number;
  linked_completed_structured_sessions: number;
  linked_user_turns: number;
  linked_practice_last_30_days: number;
  current_focus: { basis: string; label: string; goal_id: string | null; focus_area_id: string | null } | null;
  focus_areas: Array<{
    focus_area_id: string;
    title: string;
    practice_mode: PracticeMode;
    status: "active" | "completed";
    linked_practiced_sessions: number;
    linked_user_turns: number;
    latest_practice_at: string | null;
    latest_summary_available: boolean;
    recent_strength: unknown;
    recent_weakness: unknown;
  }>;
  latest_linked_practice: { id: string; title: string } | null;
  recent_strength: unknown;
  recent_weakness: unknown;
  recurring_strengths: unknown[];
  recurring_weaknesses: unknown[];
  rating_history: unknown[];
  next_action: {
    activity: "continue" | PracticeMode;
    title: string;
    reason: string;
    focus_area_id: string | null;
    evidence: string[];
    action: Goal["action"];
  };
};
