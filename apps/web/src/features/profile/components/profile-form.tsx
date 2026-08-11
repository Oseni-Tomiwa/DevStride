"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, createAuthenticatedApiClient } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/client";
import {
  communicationGoalValues,
  currentLevelValues,
  feedbackPreferenceValues,
  initialOnboardingValues,
  onboardingSchema,
  targetRoleValues,
  type OnboardingFormValues,
} from "../../onboarding/schemas";

const labels = {
  current_level: { beginner: "Beginner", junior: "Junior", mid_level: "Mid-level", senior: "Senior" },
  target_role: { backend_engineer: "Backend engineer", frontend_engineer: "Frontend engineer", fullstack_engineer: "Full-stack engineer", cloud_engineer: "Cloud engineer", devops_engineer: "DevOps engineer", ai_engineer: "AI engineer" },
  communication_goal: { technical_interviews: "Technical interviews", behavioral_interviews: "Behavioral interviews", group_discussions: "Group discussions", workplace_communication: "Workplace communication", public_speaking: "Public speaking", all: "All of these" },
  feedback_preference: { supportive: "Supportive", direct: "Direct", strict: "Strict", balanced: "Balanced" },
} as const;

type FieldName = keyof OnboardingFormValues;
type FieldErrors = Partial<Record<FieldName, string>>;
type ProfileFormMode = "onboarding" | "edit";
type ProfileFormProps = { mode: ProfileFormMode; initialValues?: OnboardingFormValues };

function stackFromInput(value: string): string[] {
  return value.split(",").map((entry) => entry.trim());
}

export function ProfileForm({ mode, initialValues = initialOnboardingValues }: ProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<OnboardingFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = mode === "edit";

  function updateValue(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    const parsed = onboardingSchema.safeParse({ ...values, preferred_stack: stackFromInput(values.preferred_stack) });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName | undefined;
        if (field && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      setError("Please review the highlighted fields.");
      return;
    }

    setIsLoading(true);
    try {
      const api = createAuthenticatedApiClient(createClient());
      if (isEditing) {
        await api.patch("/api/v1/profile/me", parsed.data);
        setSuccess("Your profile has been updated.");
      } else {
        await api.post("/api/v1/onboarding", parsed.data);
        router.push("/dashboard");
        router.refresh();
      }
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 401) { router.push("/login"); router.refresh(); return; }
        if (cause.status === 404) { router.push("/onboarding"); return; }
        if (cause.status === 409) { setError("Onboarding is already complete. Redirecting you to the dashboard."); router.push("/dashboard"); return; }
        if (cause.status === 422) { setError("The API rejected these details. Please review the form."); return; }
        setError(cause.status === 0 ? "We could not reach DevStride. Check your connection and try again." : "We could not save your profile. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  const fieldError = (field: FieldName) => fieldErrors[field] && <p className="field-error" id={`${field}-error`}>{fieldErrors[field]}</p>;

  return (
    <section className="auth-card onboarding-card" aria-labelledby="profile-form-title">
      <div className="profile-form-intro">
        <p className="eyebrow">{isEditing ? "Profile settings" : "Your starting point"}</p>
        <h1 id="profile-form-title">{isEditing ? "Shape your practice space." : "Let’s tailor DevStride to you."}</h1>
        <p className="muted">{isEditing ? "Keep your coaching preferences up to date." : "A few details help us make your engineering practice more relevant."}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-section">
          <div className="form-section-heading"><span className="step-number">01</span><div><h2>About you</h2><p className="field-hint">How should we address you?</p></div></div>
          <div className="field-group field-group-wide">
            <label htmlFor="display_name">Display name</label>
            <input id="display_name" name="display_name" maxLength={100} required value={values.display_name} aria-invalid={Boolean(fieldErrors.display_name)} aria-describedby={fieldErrors.display_name ? "display_name-error" : undefined} onChange={(event) => updateValue("display_name", event.target.value)} />
            {fieldError("display_name")}
          </div>
        </div>
        <div className="form-section">
          <div className="form-section-heading"><span className="step-number">02</span><div><h2>Your direction</h2><p className="field-hint">Set the context for your practice.</p></div></div>
          <div className="field-grid">
            <div className="field-group"><label htmlFor="current_level">Current level</label><select id="current_level" value={values.current_level} onChange={(event) => updateValue("current_level", event.target.value)}>{currentLevelValues.map((value) => <option key={value} value={value}>{labels.current_level[value]}</option>)}</select>{fieldError("current_level")}</div>
            <div className="field-group"><label htmlFor="target_role">Target role</label><select id="target_role" value={values.target_role} onChange={(event) => updateValue("target_role", event.target.value)}>{targetRoleValues.map((value) => <option key={value} value={value}>{labels.target_role[value]}</option>)}</select>{fieldError("target_role")}</div>
            <div className="field-group field-group-wide"><label htmlFor="preferred_stack">Preferred stack</label><input id="preferred_stack" name="preferred_stack" placeholder="Python, PostgreSQL, Docker" required value={values.preferred_stack} aria-invalid={Boolean(fieldErrors.preferred_stack)} aria-describedby={fieldErrors.preferred_stack ? "preferred_stack-error" : undefined} onChange={(event) => updateValue("preferred_stack", event.target.value)} /><p className="field-hint">Separate technologies with commas.</p>{fieldError("preferred_stack")}</div>
          </div>
        </div>
        <div className="form-section">
          <div className="form-section-heading"><span className="step-number">03</span><div><h2>Communication preferences</h2><p className="field-hint">Choose how you want to grow.</p></div></div>
          <div className="field-grid">
            <div className="field-group"><label htmlFor="communication_goal">Communication goal</label><select id="communication_goal" value={values.communication_goal} onChange={(event) => updateValue("communication_goal", event.target.value)}>{communicationGoalValues.map((value) => <option key={value} value={value}>{labels.communication_goal[value]}</option>)}</select>{fieldError("communication_goal")}</div>
            <div className="field-group"><label htmlFor="feedback_preference">Feedback preference</label><select id="feedback_preference" value={values.feedback_preference} onChange={(event) => updateValue("feedback_preference", event.target.value)}>{feedbackPreferenceValues.map((value) => <option key={value} value={value}>{labels.feedback_preference[value]}</option>)}</select>{fieldError("feedback_preference")}</div>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-success" role="status">{success}</p>}
        <div className="form-actions profile-form-actions">
          <p className="form-actions-note">
            {isEditing ? "Changes apply to future practice sessions." : "You can update these preferences later."}
          </p>
          <button type="submit" disabled={isLoading}>{isLoading ? "Saving…" : isEditing ? "Save changes" : "Complete onboarding"}</button>
        </div>
      </form>
    </section>
  );
}
