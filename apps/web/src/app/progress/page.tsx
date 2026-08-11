import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { getProgressSummary } from "../../features/progress/api";
import { ProgressEmptyState, ProgressOverview } from "../../features/progress/components/progress-overview";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    const summary = await getProgressSummary(supabase);
    return (
      <AppShell current="progress">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">Practice record</p>
            <h1>Progress</h1>
            <p className="muted">A clear record of the sessions you have actually practiced.</p>
          </div>
        </header>
        {summary.total_sessions === 0 ? <ProgressEmptyState /> : <ProgressOverview summary={summary} />}
      </AppShell>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    return (
      <AppShell current="progress" contentClassName="page-content conversation-shell conversation-empty">
        <div role="alert">
          <h1>Progress is unavailable</h1>
          <p className="muted">We could not load your practice history. Please try again.</p>
        </div>
      </AppShell>
    );
  }
}
