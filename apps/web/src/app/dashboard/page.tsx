import { redirect } from "next/navigation";

import { LogoutButton } from "../../features/auth/components/logout-button";
import { ApiError, createAuthenticatedApiClient } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  try {
    await createAuthenticatedApiClient(supabase).get("/api/v1/profile/me");
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
    <main className="page-shell">
      <section>
        <p className="eyebrow">Dashboard</p>
        <h1>Your next stride starts here.</h1>
        <p className="muted">You are signed in as {user.email ?? "your account"}.</p>
        <LogoutButton />
      </section>
    </main>
  );
}
