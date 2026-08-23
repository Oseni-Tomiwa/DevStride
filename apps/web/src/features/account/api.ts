import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";

export type AccountExport = Record<string, unknown>;

export function exportAccountData(supabase: SupabaseClient) {
  return createAuthenticatedApiClient(supabase).get<AccountExport>("/api/v1/account/export");
}

export function deleteAccount(supabase: SupabaseClient) {
  return createAuthenticatedApiClient(supabase).post<void>("/api/v1/account/delete", {
    confirmation: "DELETE",
  });
}
