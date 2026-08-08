import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="page-shell">
      <section>
        <p className="eyebrow">Onboarding</p>
        <h1>Welcome to DevStride.</h1>
        <p className="muted">Your onboarding flow will be added in the next task.</p>
      </section>
    </main>
  );
}
