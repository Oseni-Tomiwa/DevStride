"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { z } from "zod";

import { DevStrideLogo } from "../../../components/brand/devstride-logo";
import { createClient } from "../../../lib/supabase/client";
import { getSafeReturnPath } from "../../../lib/supabase/return-path";

const emailSchema = z.string().trim().email("Enter a valid email address.");

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setIsLoading(true);
    try {
      const returnTo = getSafeReturnPath(searchParams.get("next"));
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", "/reset-password");
      callback.searchParams.set("returnTo", returnTo);
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(parsed.data, {
        redirectTo: callback.toString(),
      });
      if (resetError) {
        setError("We could not send reset instructions. Please try again.");
        return;
      }
      setMessage("If an account matches that email, reset instructions are on the way. Check your inbox.");
    } catch {
      setError("We could not send reset instructions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="forgot-password-title">
      <Link href="/" aria-label="DevStride home"><DevStrideLogo variant="auth" /></Link>
      <h1 id="forgot-password-title">Reset your password</h1>
      <p className="muted">Enter your email and we’ll send instructions if an account matches it.</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="reset-email">Email</label>
        <input id="reset-email" name="email" type="email" autoComplete="email" required value={email} aria-invalid={Boolean(error)} onChange={(event) => { setEmail(event.target.value); setError(null); setMessage(null); }} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button type="submit" disabled={isLoading}>{isLoading ? "Sending instructions…" : "Send reset instructions"}</button>
      </form>
      <Link href="/login">Back to log in</Link>
    </section>
  );
}
