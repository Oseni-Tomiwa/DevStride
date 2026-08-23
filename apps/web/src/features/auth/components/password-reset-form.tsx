"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { z } from "zod";

import { createClient } from "../../../lib/supabase/client";
import { getSafeReturnPath } from "../../../lib/supabase/return-path";
import { PasswordField } from "./password-field";
import { PASSWORD_MIN_LENGTH } from "../validation";

const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);

export function PasswordResetForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(() => searchParams.get("error") === "expired" ? "This reset link is invalid or expired. Request a new one." : null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid password.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password: parsed.data });
      if (updateError) {
        setError("We could not update your password. Your reset link may have expired; request a new one and try again.");
        return;
      }
      setPassword("");
      setConfirmation("");
      setSuccess(true);
    } catch {
      setError("We could not update your password. Your reset link may have expired; request a new one and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const destination = getSafeReturnPath(searchParams.get("next"));

  return (
    <section className="auth-card" aria-labelledby="password-reset-title">
      <h1 id="password-reset-title">Choose a new password</h1>
      <p className="muted">Use at least {PASSWORD_MIN_LENGTH} characters. Your new password will protect future sign-ins.</p>
      <form onSubmit={handleSubmit} noValidate>
        <PasswordField id="reset-password" label="New password" value={password} onChange={(value) => { setPassword(value); setError(null); }} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />
        <PasswordField id="reset-password-confirmation" label="Confirm new password" value={confirmation} onChange={(value) => { setConfirmation(value); setError(null); }} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {success ? <p className="form-success" role="status">Your password has been updated. You can continue securely.</p> : <button type="submit" disabled={isLoading}>{isLoading ? "Updating password…" : "Update password"}</button>}
      </form>
      {success ? <Link href={destination}>Continue to DevStride</Link> : <Link href="/login">Back to log in</Link>}
    </section>
  );
}
