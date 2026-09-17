import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { mobileConfig } from "./runtime-config";
import { getUsableAccessToken } from "./session-token";

export const supabase = createClient(
  mobileConfig.supabaseUrl,
  mobileConfig.supabasePublishableKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export const getAccessToken = () => getUsableAccessToken(supabase.auth);
