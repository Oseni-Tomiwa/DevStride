import type { OnboardingValues } from "../onboarding/schemas";

export type Profile = OnboardingValues & {
  id: string;
  user_id: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};
