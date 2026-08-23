import { Suspense } from "react";
import Link from "next/link";

import { PasswordResetForm } from "../../features/auth/components/password-reset-form";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <main className="auth-page"><section className="auth-card" aria-labelledby="reset-unavailable-title"><h1 id="reset-unavailable-title">Reset link unavailable</h1><p className="form-error" role="alert">This reset link is invalid or expired. Request a new one to continue.</p><Link href="/forgot-password">Request a new reset link</Link></section></main>;
  }

  return <main className="auth-page"><Suspense fallback={<p className="loading">Loading…</p>}><PasswordResetForm /></Suspense></main>;
}
