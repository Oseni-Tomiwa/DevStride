import { Suspense } from "react";

import { AuthForm } from "../../features/auth/components/auth-form";

export default function LoginPage() {
  return <main className="auth-page"><Suspense fallback={<p className="loading">Loading…</p>}><AuthForm mode="login" /></Suspense></main>;
}
