"use client";

import { FormEvent, useState } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "../../../lib/supabase/client";
import { DevStrideLogo } from "../../../components/brand/devstride-logo";
import { PASSWORD_MIN_LENGTH } from "../validation";

type AuthMode = "login" | "sign-up";

const copy: Record<AuthMode, { title: string; submit: string; alternate: string; alternateHref: string }> = {
  login: {
    title: "Welcome back",
    submit: "Log in",
    alternate: "Need an account? Sign up",
    alternateHref: "/sign-up",
  },
  "sign-up": {
    title: "Create your account",
    submit: "Sign up",
    alternate: "Already have an account? Log in",
    alternateHref: "/login",
  },
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const content = copy[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const supabase = createClient();
    const next = searchParams.get("next");
    const destination = next?.startsWith("/") ? next : "/dashboard";
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}` },
        });

    setIsLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account before logging in.");
      return;
    }

    if (!result.data.session) {
      setError("Authentication succeeded without an active session. Please try logging in again.");
      return;
    }

    window.location.assign(destination);
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <DevStrideLogo variant="auth" />
      <h1 id="auth-title">{content.title}</h1>
      <p className="muted">Build confidence for your next engineering stride.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={PASSWORD_MIN_LENGTH}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Please wait…" : content.submit}
        </button>
      </form>
      <a href={content.alternateHref}>{content.alternate}</a>
    </section>
  );
}
