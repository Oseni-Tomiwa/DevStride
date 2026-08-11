import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { MemoryManager } from "../../features/memory/components/memory-manager";
import { listMemories } from "../../features/memory/api";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    const memories = await listMemories(supabase);
    return (
      <AppShell current="memories" contentClassName="page-content memory-page">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">Your context</p>
            <h1>Memory</h1>
            <p className="muted">
              DevStride remembers a small set of useful coaching context for Mentor,
              Interview, and Team Practice sessions. You can edit or delete anything here.
            </p>
          </div>
        </header>
        <MemoryManager initialMemories={memories} />
      </AppShell>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    throw cause;
  }
}
