import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { ProfileForm } from "../../features/profile/components/profile-form";
import { getAuthenticatedProfile } from "../../features/profile/api";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  try {
    const profile = await getAuthenticatedProfile(supabase);
    return (
      <AppShell current="profile">
        <ProfileForm
          mode="edit"
          initialValues={{
            display_name: profile.display_name,
            current_level: profile.current_level,
            target_role: profile.target_role,
            preferred_stack: profile.preferred_stack.join(", "),
            communication_goal: profile.communication_goal,
            feedback_preference: profile.feedback_preference,
          }}
        />
      </AppShell>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      redirect("/onboarding");
    }
    if (cause instanceof ApiError && cause.status === 401) {
      redirect("/login");
    }
    throw cause;
  }
}
