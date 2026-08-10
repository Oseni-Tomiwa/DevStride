import React from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "../../components/app-header";
import { InterviewEntry } from "../../features/conversations/components/interview-entry";
import { MentorEntry } from "../../features/conversations/components/mentor-entry";
import { Profile } from "../../features/profile/types";
import { getAuthenticatedProfile } from "../../features/profile/api";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

const displayLabels: Record<string, string> = {
  beginner: "Beginner",
  junior: "Junior",
  mid_level: "Mid-level",
  senior: "Senior",
  backend_engineer: "Backend engineer",
  frontend_engineer: "Frontend engineer",
  fullstack_engineer: "Full-stack engineer",
  cloud_engineer: "Cloud engineer",
  devops_engineer: "DevOps engineer",
  ai_engineer: "AI engineer",
  technical_interviews: "Technical interviews",
  behavioral_interviews: "Behavioral interviews",
  group_discussions: "Group discussions",
  workplace_communication: "Workplace communication",
  public_speaking: "Public speaking",
  all: "All communication goals",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let profile: Profile;
  try {
    profile = await getAuthenticatedProfile(supabase);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      redirect("/onboarding");
    }
    if (cause instanceof ApiError && cause.status === 401) {
      redirect("/login");
    }
    throw cause;
  }

  return (
    <main className="page-shell app-page">
      <AppHeader current="dashboard" />
      <section className="dashboard-shell">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Welcome back, {profile.display_name}</h1>
            <p className="muted">Your personalized engineering practice space.</p>
          </div>
        </header>

        <section className="profile-summary" aria-labelledby="profile-summary-title">
          <div className="summary-heading">
            <p className="eyebrow">Your profile</p>
            <h2 id="profile-summary-title">Your current direction</h2>
          </div>
          <dl className="profile-grid">
            <div>
              <dt>Current level</dt>
              <dd>{displayLabels[profile.current_level]}</dd>
            </div>
            <div>
              <dt>Target role</dt>
              <dd>{displayLabels[profile.target_role]}</dd>
            </div>
            <div>
              <dt>Preferred stack</dt>
              <dd>{profile.preferred_stack.join(", ")}</dd>
            </div>
            <div>
              <dt>Communication goal</dt>
              <dd>{displayLabels[profile.communication_goal]}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="practice-title">
          <div className="summary-heading">
            <p className="eyebrow">Practice space</p>
            <h2 id="practice-title">Choose your next step</h2>
          </div>
          <div className="practice-grid">
            <article className="practice-card">
              <h3>Learn with Mentor</h3>
              <p className="muted">A profile-aware software-engineering learning space.</p>
              <MentorEntry />
            </article>
            <article className="practice-card">
              <h3>Mock Interview</h3>
              <p className="muted">Practice technical and behavioral engineering interviews.</p>
              <InterviewEntry />
            </article>
            <article className="practice-card">
              <h3>Team Practice</h3>
              <p className="muted">Structured practice is coming soon.</p>
              <button type="button" disabled>Coming soon</button>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
