import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { getGoalProgress, listGoals } from "../../features/goals/api";
import { GoalManager } from "../../features/goals/components/goal-manager";
import type { GoalProgress } from "../../features/goals/types";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    const goals = await listGoals(supabase);
    let progress: GoalProgress | null = null;
    const active = goals.find((goal) => goal.status === "active");
    if (active) {
      try { progress = await getGoalProgress(supabase, active.id); } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) redirect("/login");
      }
    }
    return <AppShell current="goals" contentClassName="page-content goals-page"><header className="conversation-header"><div><p className="eyebrow">Your direction</p><h1>Goals</h1><p className="muted">Turn an intention into a small, observable practice plan.</p></div></header><GoalManager initialGoals={goals} initialProgress={progress} /></AppShell>;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    return <AppShell current="goals" contentClassName="page-content conversation-shell conversation-empty"><div role="alert"><h1>Goals are unavailable</h1><p className="muted">We could not load your goals. Please try again.</p></div></AppShell>;
  }
}
