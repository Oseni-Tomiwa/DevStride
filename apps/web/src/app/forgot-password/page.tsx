import { Suspense } from "react";

import { ForgotPasswordForm } from "../../features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><Suspense fallback={<p className="loading">Loading…</p>}><ForgotPasswordForm /></Suspense></main>;
}
