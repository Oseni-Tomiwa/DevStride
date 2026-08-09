import { redirect } from "next/navigation";

import { OnboardingForm } from "../../features/onboarding/components/onboarding-form";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="page-shell">
      <OnboardingForm />
    </main>
  );
}
