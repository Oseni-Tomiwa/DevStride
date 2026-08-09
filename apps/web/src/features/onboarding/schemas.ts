import { z } from "zod";

export const currentLevelValues = ["beginner", "junior", "mid_level", "senior"] as const;
export const targetRoleValues = [
  "backend_engineer",
  "frontend_engineer",
  "fullstack_engineer",
  "cloud_engineer",
  "devops_engineer",
  "ai_engineer",
] as const;
export const communicationGoalValues = [
  "technical_interviews",
  "behavioral_interviews",
  "group_discussions",
  "workplace_communication",
  "public_speaking",
  "all",
] as const;
export const feedbackPreferenceValues = ["supportive", "direct", "strict", "balanced"] as const;

export const onboardingSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required.").max(
    100,
    "Display name must be 100 characters or fewer.",
  ),
  current_level: z.enum(currentLevelValues, { message: "Choose your current level." }),
  target_role: z.enum(targetRoleValues, { message: "Choose a target role." }),
  preferred_stack: z.array(
    z.string().trim().min(1, "Stack entries cannot be blank."),
  ).min(1, "Add at least one technology to your preferred stack."),
  communication_goal: z.enum(communicationGoalValues, {
    message: "Choose a communication goal.",
  }),
  feedback_preference: z.enum(feedbackPreferenceValues, {
    message: "Choose a feedback preference.",
  }),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

export type OnboardingFormValues = Omit<OnboardingValues, "preferred_stack"> & {
  preferred_stack: string;
};

export const initialOnboardingValues: OnboardingFormValues = {
  display_name: "",
  current_level: "beginner",
  target_role: "backend_engineer",
  preferred_stack: "",
  communication_goal: "technical_interviews",
  feedback_preference: "balanced",
};
