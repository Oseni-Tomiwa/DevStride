import { Suspense } from "react";

import { AuthForm } from "../../features/auth/components/auth-form";

export default function LoginPage() {
  return <Suspense fallback={<p className="loading">Loading…</p>}><AuthForm mode="login" /></Suspense>;
}
