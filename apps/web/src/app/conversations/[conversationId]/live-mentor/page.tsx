import { notFound, redirect } from "next/navigation";

import { AppShell } from "../../../../components/app-shell";
import { LiveInterviewSpike } from "../../../../features/conversations/components/live-interview-spike";
import { getConversation, listMessages } from "../../../../features/conversations/api";
import { ApiError } from "../../../../lib/api/client";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LiveMentorPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { conversationId } = await params;
  try {
    const [conversation, messages] = await Promise.all([
      getConversation(supabase, conversationId),
      listMessages(supabase, conversationId),
    ]);
    if (conversation.mode !== "mentor" || conversation.metadata.mentor_transport !== "live_voice") notFound();
    const enabled = process.env.LIVE_MENTOR_ENABLED === "true";
    return (
      <AppShell current="conversations" contentClassName="page-content conversation-page">
        {enabled ? (
          <LiveInterviewSpike
            conversationId={conversation.id}
            practiceMode="mentor"
            mentorStarted={conversation.metadata.mentor_started === true}
            initialMessages={messages}
          />
        ) : (
          <section className="conversation-empty" role="status">
            <h1>Live Mentor is disabled</h1>
            <p className="muted">Live Mentor is not enabled in this environment.</p>
          </section>
        )}
      </AppShell>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    if (cause instanceof ApiError && cause.status === 404) notFound();
    throw cause;
  }
}
