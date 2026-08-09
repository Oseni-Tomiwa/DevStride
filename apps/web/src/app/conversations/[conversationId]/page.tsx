import { notFound, redirect } from "next/navigation";

import { ConversationDetail } from "../../../features/conversations/components/conversation-detail";
import { getConversation, listMessages } from "../../../features/conversations/api";
import { ApiError } from "../../../lib/api/client";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type ConversationPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: ConversationPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { conversationId } = await params;
  try {
    const [conversation, messages] = await Promise.all([
      getConversation(supabase, conversationId),
      listMessages(supabase, conversationId),
    ]);
    return (
      <main className="page-shell">
        <ConversationDetail conversation={conversation} initialMessages={messages} />
      </main>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    if (cause instanceof ApiError && cause.status === 404) notFound();
    return (
      <main className="page-shell">
        <section className="conversation-shell conversation-empty" role="alert">
          <h1>Conversation unavailable</h1>
          <p className="muted">We could not load this conversation. Please try again.</p>
        </section>
      </main>
    );
  }
}
