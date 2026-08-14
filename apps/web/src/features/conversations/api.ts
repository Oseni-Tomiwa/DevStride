import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";
import type {
  Conversation,
  CreateConversationInput,
  CreateUserMessageInput,
  Message,
  LiveAnalytics,
  RealtimeSession,
  RealtimeTranscriptTurn,
  RenameConversationInput,
  RespondResponse,
  SessionSummary,
} from "./types";

export function listConversations(supabase: SupabaseClient) {
  return createAuthenticatedApiClient(supabase).get<Conversation[]>("/api/v1/conversations");
}

export function createConversation(
  supabase: SupabaseClient,
  input: CreateConversationInput,
) {
  return createAuthenticatedApiClient(supabase).post<Conversation>(
    "/api/v1/conversations",
    input,
  );
}

export function getConversation(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).get<Conversation>(
    `/api/v1/conversations/${conversationId}`,
  );
}

export function renameConversation(
  supabase: SupabaseClient,
  conversationId: string,
  input: RenameConversationInput,
) {
  return createAuthenticatedApiClient(supabase).patch<Conversation>(
    `/api/v1/conversations/${conversationId}`,
    input,
  );
}

export function deleteConversation(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).delete(
    `/api/v1/conversations/${conversationId}`,
  );
}

export function listMessages(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).get<Message[]>(
    `/api/v1/conversations/${conversationId}/messages`,
  );
}

export function createUserMessage(
  supabase: SupabaseClient,
  conversationId: string,
  input: CreateUserMessageInput,
) {
  return createAuthenticatedApiClient(supabase).post<Message>(
    `/api/v1/conversations/${conversationId}/messages`,
    input,
  );
}


export function respondToConversation(
  supabase: SupabaseClient,
  conversationId: string,
  input: CreateUserMessageInput,
) {
  return createAuthenticatedApiClient(supabase).post<RespondResponse>(
    `/api/v1/conversations/${conversationId}/respond`,
    input,
  );
}


export function streamConversation(
  supabase: SupabaseClient,
  conversationId: string,
  input: CreateUserMessageInput,
  signal?: AbortSignal,
) {
  return createAuthenticatedApiClient(supabase).stream(
    `/api/v1/conversations/${conversationId}/stream`,
    input,
    signal,
  );
}

export function retryConversationMessage(
  supabase: SupabaseClient,
  conversationId: string,
  messageId: string,
  signal?: AbortSignal,
) {
  return createAuthenticatedApiClient(supabase).stream(
    `/api/v1/conversations/${conversationId}/messages/${messageId}/retry`,
    {},
    signal,
  );
}

export function startInterview(
  supabase: SupabaseClient,
  conversationId: string,
  signal?: AbortSignal,
) {
  return createAuthenticatedApiClient(supabase).stream(
    `/api/v1/conversations/${conversationId}/interview-start`,
    {},
    signal,
  );
}

export function createRealtimeSession(
  supabase: SupabaseClient,
  conversationId: string,
) {
  return createAuthenticatedApiClient(supabase).post<RealtimeSession>(
    "/api/v1/realtime/sessions",
    { conversation_id: conversationId },
  );
}

export function connectRealtimeSession(
  supabase: SupabaseClient,
  conversationId: string,
  offerSdp: string,
) {
  return createAuthenticatedApiClient(supabase)
    .rawPostResponse(
      `/api/v1/realtime/sessions/${conversationId}/connect`,
      offerSdp,
      "application/sdp",
    )
    .then(async (response) => ({
      sdp: await response.text(),
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
    }));
}

export function persistRealtimeTranscriptTurn(
  supabase: SupabaseClient,
  conversationId: string,
  input: { event_id: string; role: "user" | "assistant"; content: string; final: true },
) {
  return createAuthenticatedApiClient(supabase).post<RealtimeTranscriptTurn>(
    `/api/v1/realtime/sessions/${conversationId}/transcript-turns`,
    input,
  );
}

export function endRealtimeInterview(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).post<RealtimeTranscriptTurn>(
    `/api/v1/realtime/sessions/${conversationId}/end`,
    {},
  );
}

export function endLiveMentor(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).post<{ status: string; summary_id: string }>(
    `/api/v1/realtime/sessions/${conversationId}/end`,
    {},
  );
}

export function recordRealtimeAnalyticsEvent(
  supabase: SupabaseClient,
  conversationId: string,
  input: { event_id: string; event_type: string; occurred_at: string },
) {
  return createAuthenticatedApiClient(supabase).post<{ status: string }>(
    `/api/v1/realtime/sessions/${conversationId}/analytics-events`,
    input,
  );
}

export function getRealtimeAnalytics(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).get<LiveAnalytics>(
    `/api/v1/realtime/sessions/${conversationId}/analytics`,
  );
}

export function startTeam(
  supabase: SupabaseClient,
  conversationId: string,
  signal?: AbortSignal,
) {
  return createAuthenticatedApiClient(supabase).stream(
    `/api/v1/conversations/${conversationId}/team-start`,
    {},
    signal,
  );
}

export function getConversationSummary(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).get<SessionSummary>(
    `/api/v1/conversations/${conversationId}/summary`,
  );
}

export function createConversationSummary(supabase: SupabaseClient, conversationId: string) {
  return createAuthenticatedApiClient(supabase).post<SessionSummary>(
    `/api/v1/conversations/${conversationId}/summary`,
    {},
  );
}
