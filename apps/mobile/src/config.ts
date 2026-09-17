export type MobileConfig = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type MobileEnvironment = {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

function requireValue(environment: MobileEnvironment, key: keyof MobileEnvironment): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`Missing required mobile environment variable: ${key}`);
  }
  return value;
}

export function readMobileConfig(environment: MobileEnvironment): MobileConfig {
  return {
    apiBaseUrl: requireValue(environment, "EXPO_PUBLIC_API_BASE_URL").replace(/\/+$/, ""),
    supabaseUrl: requireValue(environment, "EXPO_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: requireValue(
      environment,
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
  };
}
