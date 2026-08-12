import { notFound, redirect } from "next/navigation";

import { AppShell } from "../../../../components/app-shell";
import { LiveInterviewSpike } from "../../../../features/conversations/components/live-interview-spike";
import { getConversation } from "../../../../features/conversations/api";
import { ApiError } from "../../../../lib/api/client";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LiveInterviewSpikePage({ params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { conversationId } = await params;
  try {
    const conversation = await getConversation(supabase, conversationId);
    if (conversation.mode !== "interview") notFound();
    const enabled = process.env.LIVE_INTERVIEW_ENABLED === "true";
    const interviewType = typeof conversation.metadata.interview_type === "string" ? conversation.metadata.interview_type : "technical";
    const interviewFocus = typeof conversation.metadata.interview_focus === "string" ? conversation.metadata.interview_focus : null;
    return <AppShell current="conversations" contentClassName="page-content conversation-page">{enabled ? <LiveInterviewSpike conversationId={conversation.id} interviewType={interviewType} interviewFocus={interviewFocus} /> : <section className="conversation-empty" role="status"><h1>Live Interview is disabled</h1><p className="muted">This experimental realtime voice spike is not enabled in this environment.</p></section>}</AppShell>;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    if (cause instanceof ApiError && cause.status === 404) notFound();
    throw cause;
  }
}
