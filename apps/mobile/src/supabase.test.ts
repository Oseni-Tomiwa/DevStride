const mockCreateClient = jest.fn(() => ({
  auth: {
    signOut: jest.fn(async () => ({ error: null })),
  },
}));

jest.mock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock("./runtime-config", () => ({
  mobileConfig: {
    apiBaseUrl: "https://api.example.com",
    supabaseUrl: "https://project-ref.supabase.co",
    supabasePublishableKey: "publishable-test-key",
  },
}));

describe("mobile Supabase client", () => {
  it("uses SecureStore persistence with explicit PKCE email-flow correlation", () => {
    jest.isolateModules(() => {
      // Jest's synchronous module isolation requires CommonJS loading in this test environment.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./supabase");
    });

    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://project-ref.supabase.co",
      "publishable-test-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce",
          persistSession: true,
          storageKey: "sb-project-ref-auth-token",
          experimental: { appendPkceFlowIdToRedirects: true },
        }),
      }),
    );
  });
});
