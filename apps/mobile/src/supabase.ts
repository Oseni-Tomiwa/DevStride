import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

import { installPkceCrypto } from "./auth/pkce-crypto";
import {
  SecureSessionStorage,
  createExpoSecureStoreDriver,
  getSupabaseAuthStorageKey,
} from "./auth/secure-session-storage";
import { clearAuthSession } from "./auth/session-validation";
import { mobileConfig } from "./runtime-config";
import { getUsableAccessToken } from "./session-token";

installPkceCrypto();

export const supabaseAuthStorageKey = getSupabaseAuthStorageKey(mobileConfig.supabaseUrl);

export const secureSessionStorage = new SecureSessionStorage({
  authStorageKey: supabaseAuthStorageKey,
  legacyStorage: {
    deleteItem: (key) => AsyncStorage.removeItem(key),
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
  },
  secureStore: createExpoSecureStoreDriver(SecureStore),
});

export const supabase = createClient(
  mobileConfig.supabaseUrl,
  mobileConfig.supabasePublishableKey,
  {
    auth: {
      storage: secureSessionStorage,
      storageKey: supabaseAuthStorageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      experimental: { appendPkceFlowIdToRedirects: true },
    },
  },
);

export const getAccessToken = () => getUsableAccessToken(supabase.auth);

export const clearMobileAuthSession = () =>
  clearAuthSession(supabase.auth, () => secureSessionStorage.clearAuthData());
