import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";
import type {
  Conversation,
  CreateConversationInput,
  CreateUserMessageInput,
  Message,
  RenameConversationInput,
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
