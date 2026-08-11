import { notFound, redirect } from "next/navigation";

import { AppHeader } from "../../../components/app-header";
import { ConversationDetail } from "../../../features/conversations/components/conversation-detail";
import { getConversation, getConversationSummary, listMessages } from "../../../features/conversations/api";
import type { SessionSummary } from "../../../features/conversations/types";
import { getAuthenticatedProfile } from "../../../features/profile/api";
import type { Profile } from "../../../features/profile/types";
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
    let mentorProfile: Profile | null = null;
    let sessionSummary: SessionSummary | null = null;
    if (conversation.mode === "mentor" || conversation.mode === "interview" || conversation.mode === "team") {
      try {
        sessionSummary = await getConversationSummary(supabase, conversationId);
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
      }
    }
    if (conversation.mode === "mentor" || conversation.mode === "interview" || conversation.mode === "team") {
      try {
        mentorProfile = await getAuthenticatedProfile(supabase);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) redirect("/onboarding");
        throw cause;
      }
    }
    return (
      <main className="page-shell app-page">
        <AppHeader current="conversations" />
        <section className="page-content conversation-page" id="main-content" tabIndex={-1}>
          <ConversationDetail
            conversation={conversation}
            initialMessages={messages}
            mentorContext={mentorProfile ? {
              currentLevel: mentorProfile.current_level,
              targetRole: mentorProfile.target_role,
            } : undefined}
            interviewContext={conversation.mode === "interview" && mentorProfile ? {
              interviewType: typeof conversation.metadata.interview_type === "string" ? conversation.metadata.interview_type : "technical",
              interviewFocus: typeof conversation.metadata.interview_focus === "string" ? conversation.metadata.interview_focus : null,
              currentLevel: mentorProfile.current_level,
              targetRole: mentorProfile.target_role,
            } : undefined}
            initialSummary={sessionSummary}
          />
        </section>
      </main>
    );
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) redirect("/login");
    if (cause instanceof ApiError && cause.status === 404) notFound();
    return (
      <main className="page-shell app-page">
        <AppHeader current="conversations" />
        <section className="page-content conversation-shell conversation-empty" id="main-content" tabIndex={-1} role="alert">
          <h1>Conversation unavailable</h1>
          <p className="muted">We could not load this conversation. Please try again.</p>
        </section>
      </main>
    );
  }
}
