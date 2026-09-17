export const currentLevels = ["beginner", "junior", "mid_level", "senior"] as const;
export const targetRoles = [
  "backend_engineer",
  "frontend_engineer",
  "fullstack_engineer",
  "cloud_engineer",
  "devops_engineer",
  "ai_engineer",
] as const;
export const communicationGoals = [
  "technical_interviews",
  "behavioral_interviews",
  "group_discussions",
  "workplace_communication",
  "public_speaking",
  "all",
] as const;
export const feedbackPreferences = ["supportive", "direct", "strict", "balanced"] as const;

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type Profile = {
  id: string;
  user_id: string;
  display_name: string;
  current_level: (typeof currentLevels)[number];
  target_role: (typeof targetRoles)[number];
  preferred_stack: string[];
  communication_goal: (typeof communicationGoals)[number];
  feedback_preference: (typeof feedbackPreferences)[number];
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type SessionSnapshot = {
  access_token: string;
  expires_at?: number;
  user: { id: string };
};
