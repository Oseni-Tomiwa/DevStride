import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";
import type { Memory, MemoryCategory, MemoryCreateInput, MemoryPatchInput } from "./types";

export function listMemories(supabase: SupabaseClient, category?: MemoryCategory) {
  const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
  return createAuthenticatedApiClient(supabase).get<Memory[]>(`/api/v1/memories${suffix}`);
}

export function createMemory(supabase: SupabaseClient, input: MemoryCreateInput) {
  return createAuthenticatedApiClient(supabase).post<Memory>("/api/v1/memories", input);
}

export function updateMemory(supabase: SupabaseClient, memoryId: string, input: MemoryPatchInput) {
  return createAuthenticatedApiClient(supabase).patch<Memory>(`/api/v1/memories/${memoryId}`, input);
}

export function deleteMemory(supabase: SupabaseClient, memoryId: string) {
  return createAuthenticatedApiClient(supabase).delete(`/api/v1/memories/${memoryId}`);
}
