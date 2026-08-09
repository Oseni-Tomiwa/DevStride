import { redirect } from "next/navigation";

import { ConversationList } from "../../features/conversations/components/conversation-list";
import { listConversations } from "../../features/conversations/api";
import { ApiError } from "../../lib/api/client";
import { createClient } from "../../lib/supabase/server";

export default async function ConversationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const conversations = await listConversations(supabase);
    return (
      <main className="page-shell">
        <ConversationList initialConversations={conversations} />
      </main>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    return (
      <main className="page-shell">
        <section className="conversation-shell conversation-empty" role="alert">
          <h1>Conversations are unavailable</h1>
          <p className="muted">We could not load your conversations. Please try again.</p>
        </section>
      </main>
    );
  }
}
