"use client";

import { FormEvent, useState } from "react";
import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { createClient } from "../../../lib/supabase/client";
import { DevStrideLogo } from "../../../components/brand/devstride-logo";
import { getSafeReturnPath } from "../../../lib/supabase/return-path";
import { PASSWORD_MIN_LENGTH } from "../validation";
import { PasswordField } from "./password-field";

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
  const callbackError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() =>
    callbackError === "confirmation"
      ? "That confirmation link is invalid or expired. Please try again."
      : callbackError === "session"
        ? "We could not establish a secure session. Please log in again."
        : null,
  );
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
    const destination = getSafeReturnPath(next);
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

    try {
      const policyResponse = await fetch("/auth/session-policy", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!policyResponse.ok) throw new Error("policy_unavailable");
    } catch {
      setError("We could not establish a secure session. Please try logging in again.");
      return;
    }

    window.location.assign(destination);
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <Link href="/" aria-label="DevStride home"><DevStrideLogo variant="auth" /></Link>
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
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={PASSWORD_MIN_LENGTH} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Please wait…" : content.submit}
        </button>
      </form>
      {mode === "login" && <Link href={`/forgot-password${searchParams.get("next") ? `?next=${encodeURIComponent(getSafeReturnPath(searchParams.get("next")))}` : ""}`}>Forgot password?</Link>}
      <Link href={content.alternateHref}>{content.alternate}</Link>
      <Link className="auth-home-link" href="/">Back to DevStride</Link>
    </section>
  );
}
