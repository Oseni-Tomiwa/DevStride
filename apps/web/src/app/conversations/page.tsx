import { redirect } from "next/navigation";

import { AppShell } from "../../components/app-shell";
import { ConversationList } from "../../features/conversations/components/conversation-list";
import { listConversations } from "../../features/conversations/api";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const conversations = await listConversations(supabase);
    return (
      <AppShell current="conversations">
        <ConversationList initialConversations={conversations} />
      </AppShell>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    return (
      <AppShell current="conversations" contentClassName="page-content conversation-shell conversation-empty">
        <div role="alert">
          <h1>Conversations are unavailable</h1>
          <p className="muted">We could not load your conversations. Please try again.</p>
        </div>
      </AppShell>
    );
  }
}
