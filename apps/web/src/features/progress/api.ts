import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";
import type { ProgressSummary } from "./types";

export function getProgressSummary(supabase: SupabaseClient) {
  return createAuthenticatedApiClient(supabase).get<ProgressSummary>("/api/v1/progress");
}
