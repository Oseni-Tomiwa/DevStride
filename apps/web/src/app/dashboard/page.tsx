import { redirect } from "next/navigation";

import { LogoutButton } from "../../features/auth/components/logout-button";
import { createClient } from "../../lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
