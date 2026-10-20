import { createClient } from "@supabase/supabase-js";

import { createPkceCrypto, installPkceCrypto } from "./pkce-crypto";

const sha256Abc = Uint8Array.from([
  186, 120, 22, 191, 143, 1, 207, 234, 65, 65, 64, 222, 93, 174, 34, 35,
  176, 3, 97, 163, 150, 23, 122, 156, 180, 16, 255, 97, 242, 0, 21, 173,
]).buffer;

describe("PKCE crypto support", () => {
  it("provides SHA-256 digest and secure random values without replacing existing crypto", async () => {
    const getRandomValues = jest.fn(<T extends ArrayBufferView>(value: T) => {
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(7);
      return value;
    }) as unknown as Crypto["getRandomValues"];
    const digest = jest.fn(async () => sha256Abc);
    const existingCrypto = { getRandomValues } as unknown as Crypto;

    const pkceCrypto = createPkceCrypto(existingCrypto, digest);
    const random = pkceCrypto.getRandomValues(new Uint8Array(4));
    const hash = await pkceCrypto.subtle.digest("SHA-256", new TextEncoder().encode("abc"));

    expect(random).toEqual(Uint8Array.from([7, 7, 7, 7]));
    expect(new Uint8Array(hash)).toEqual(new Uint8Array(sha256Abc));
    expect(pkceCrypto).toBe(existingCrypto);
  });

  it("installs only the missing PKCE primitives and is idempotent", () => {
    const target = {} as typeof globalThis;
    const digest = jest.fn(async () => sha256Abc);
    const getRandomValues = jest.fn(<T extends ArrayBufferView>(value: T) => value) as unknown as Crypto["getRandomValues"];

    installPkceCrypto(target, { digest, getRandomValues });
    const first = target.crypto;
    installPkceCrypto(target, { digest, getRandomValues });

    expect(target.crypto).toBe(first);
    expect(typeof target.crypto.getRandomValues).toBe("function");
    expect(typeof target.crypto.subtle.digest).toBe("function");
  });

  it("makes Supabase email PKCE requests with an S256 challenge", async () => {
    const originalCrypto = globalThis.crypto;
    const fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(JSON.stringify({ user: null, session: null }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    const cryptoWithoutSubtle = {
      getRandomValues: <T extends ArrayBufferView>(value: T) => value,
    } as Crypto;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: cryptoWithoutSubtle });
    installPkceCrypto(globalThis, {
      digest: async () => sha256Abc,
      getRandomValues: (<T extends ArrayBufferView>(value: T) => value) as Crypto["getRandomValues"],
    });

    try {
      const client = createClient("https://project-ref.supabase.co", "publishable-test-key", {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "pkce",
          persistSession: false,
        },
        global: { fetch },
      });

      await client.auth.signUp({
        email: "mobile-test@example.invalid",
        password: "not-a-real-password",
        options: { emailRedirectTo: "devstride://auth/confirm" },
      });

      const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
      expect(body.code_challenge_method).toBe("s256");
      expect(body.code_challenge).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
    }
  });
});
