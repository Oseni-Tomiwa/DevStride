import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
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
    <AppShell current="onboarding">
      <OnboardingForm />
    </AppShell>
  );
}
