import { readMobileConfig } from "./config";

describe("readMobileConfig", () => {
  it("trims values and removes trailing slashes from the API URL", () => {
    expect(
      readMobileConfig({
        EXPO_PUBLIC_API_BASE_URL: " https://api.example.com/ ",
        EXPO_PUBLIC_SUPABASE_URL: " https://project.supabase.co ",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " public-key ",
      }),
    ).toEqual({
      apiBaseUrl: "https://api.example.com",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    });
  });

  it.each([
    "EXPO_PUBLIC_API_BASE_URL",
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ])("rejects a missing %s", (missingKey) => {
    const environment: Record<string, string | undefined> = {
      EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
      EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    };
    environment[missingKey] = "  ";

    expect(() => readMobileConfig(environment)).toThrow(missingKey);
  });
});
