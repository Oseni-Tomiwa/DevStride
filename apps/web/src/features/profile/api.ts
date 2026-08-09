import type { SupabaseClient } from "@supabase/supabase-js";

import { createAuthenticatedApiClient } from "../../lib/api/client";
import type { Profile } from "./types";

export function getAuthenticatedProfile(supabase: SupabaseClient) {
  return createAuthenticatedApiClient(supabase).get<Profile>("/api/v1/profile/me");
}
