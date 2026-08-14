import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../lib/supabase/server";
import { DevStrideLogo } from "../components/brand/devstride-logo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="landing-brand" href="/" aria-label="DevStride home">
          <DevStrideLogo variant="landing" decorative />
          <span>DevStride</span>
        </Link>
        <div className="landing-nav-actions">
          <Link href="/login">Log in</Link>
          <Link className="landing-button landing-button-small" href="/sign-up">
            Create account
          </Link>
        </div>
      </nav>

      <section className="landing-content" aria-labelledby="landing-title">
        <p className="landing-kicker">Your next engineering stride</p>
        <h1 id="landing-title">Grow into the engineer you want to become.</h1>
        <p className="landing-description">
          DevStride is an AI-powered practice environment for software engineers
          to learn, communicate, prepare, and grow professionally.
        </p>
        <div className="landing-actions">
          <Link className="landing-button" href="/sign-up">Create account</Link>
          <Link className="landing-button landing-button-secondary" href="/login">Log in</Link>
        </div>
        <p className="landing-note">
          Build your profile, set a direction, and practice with Mentor, Interview,
          Team, Progress, and Memory tools in one focused workspace.
        </p>
      </section>
    </main>
  );
}
