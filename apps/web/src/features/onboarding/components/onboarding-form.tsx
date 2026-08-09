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
} from "../schemas";

const labels = {
  current_level: {
    beginner: "Beginner",
    junior: "Junior",
    mid_level: "Mid-level",
    senior: "Senior",
  },
  target_role: {
    backend_engineer: "Backend engineer",
    frontend_engineer: "Frontend engineer",
    fullstack_engineer: "Full-stack engineer",
    cloud_engineer: "Cloud engineer",
    devops_engineer: "DevOps engineer",
    ai_engineer: "AI engineer",
  },
  communication_goal: {
    technical_interviews: "Technical interviews",
    behavioral_interviews: "Behavioral interviews",
    group_discussions: "Group discussions",
    workplace_communication: "Workplace communication",
    public_speaking: "Public speaking",
    all: "All of these",
  },
  feedback_preference: {
    supportive: "Supportive",
    direct: "Direct",
    strict: "Strict",
    balanced: "Balanced",
  },
} as const;

type FieldName = keyof OnboardingFormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

function stackFromInput(value: string): string[] {
  return value.split(",").map((entry) => entry.trim());
}

export function OnboardingForm() {
  const router = useRouter();
  const [values, setValues] = useState<OnboardingFormValues>(initialOnboardingValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateValue(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = onboardingSchema.safeParse({
      ...values,
      preferred_stack: stackFromInput(values.preferred_stack),
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName | undefined;
        if (field && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      setError("Please review the highlighted fields.");
      return;
    }

    setIsLoading(true);
    try {
      const api = createAuthenticatedApiClient(createClient());
      await api.post("/api/v1/onboarding", parsed.data);
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 401) {
          router.push("/login");
          router.refresh();
          return;
        }
        if (cause.status === 409) {
          setError("Onboarding is already complete. Redirecting you to the dashboard.");
          router.push("/dashboard");
          return;
        }
        if (cause.status === 422) {
          setError("The API rejected these details. Please review the form.");
          return;
        }
        setError(cause.status === 0
          ? "We could not reach DevStride. Check your connection and try again."
          : "We could not save your onboarding details. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="auth-card onboarding-card" aria-labelledby="onboarding-title">
      <p className="eyebrow">Your starting point</p>
      <h1 id="onboarding-title">Let&apos;s tailor DevStride to you.</h1>
      <p className="muted">Tell us where you are and what you want to practise.</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="display_name">Display name</label>
        <input
          id="display_name"
          name="display_name"
          maxLength={100}
          required
          value={values.display_name}
          onChange={(event) => updateValue("display_name", event.target.value)}
        />
        {fieldErrors.display_name && <p className="field-error">{fieldErrors.display_name}</p>}

        <label htmlFor="current_level">Current level</label>
        <select
          id="current_level"
          value={values.current_level}
          onChange={(event) => updateValue("current_level", event.target.value)}
        >
          {currentLevelValues.map((value) => <option key={value} value={value}>{labels.current_level[value]}</option>)}
        </select>
        {fieldErrors.current_level && <p className="field-error">{fieldErrors.current_level}</p>}

        <label htmlFor="target_role">Target role</label>
        <select
          id="target_role"
          value={values.target_role}
          onChange={(event) => updateValue("target_role", event.target.value)}
        >
          {targetRoleValues.map((value) => <option key={value} value={value}>{labels.target_role[value]}</option>)}
        </select>
        {fieldErrors.target_role && <p className="field-error">{fieldErrors.target_role}</p>}

        <label htmlFor="preferred_stack">Preferred stack</label>
        <input
          id="preferred_stack"
          name="preferred_stack"
          placeholder="Python, PostgreSQL, Docker"
          required
          value={values.preferred_stack}
          onChange={(event) => updateValue("preferred_stack", event.target.value)}
        />
        <p className="field-hint">Separate technologies with commas.</p>
        {fieldErrors.preferred_stack && <p className="field-error">{fieldErrors.preferred_stack}</p>}

        <label htmlFor="communication_goal">Communication goal</label>
        <select
          id="communication_goal"
          value={values.communication_goal}
          onChange={(event) => updateValue("communication_goal", event.target.value)}
        >
          {communicationGoalValues.map((value) => <option key={value} value={value}>{labels.communication_goal[value]}</option>)}
        </select>
        {fieldErrors.communication_goal && <p className="field-error">{fieldErrors.communication_goal}</p>}

        <label htmlFor="feedback_preference">Feedback preference</label>
        <select
          id="feedback_preference"
          value={values.feedback_preference}
          onChange={(event) => updateValue("feedback_preference", event.target.value)}
        >
          {feedbackPreferenceValues.map((value) => <option key={value} value={value}>{labels.feedback_preference[value]}</option>)}
        </select>
        {fieldErrors.feedback_preference && <p className="field-error">{fieldErrors.feedback_preference}</p>}

        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Saving…" : "Complete onboarding"}
        </button>
      </form>
    </section>
  );
}
