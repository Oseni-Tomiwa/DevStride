import {
  INSTALLATION_MARKER_KEY,
  SecureSessionStorage,
  createExpoSecureStoreDriver,
  getSupabaseAuthStorageKey,
} from "./secure-session-storage";

type StoreDriver = {
  deleteItem: jest.Mock<Promise<void>, [string]>;
  getItem: jest.Mock<Promise<string | null>, [string]>;
  setItem: jest.Mock<Promise<void>, [string, string]>;
  values: Map<string, string>;
};

function memoryStore(initial: Record<string, string> = {}): StoreDriver {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: jest.fn(async (key) => values.get(key) ?? null),
    setItem: jest.fn(async (key, value) => void values.set(key, value)),
    deleteItem: jest.fn(async (key) => void values.delete(key)),
  };
}

const AUTH_KEY = "sb-project-ref-auth-token";

it("derives the exact legacy storage key used by the Supabase client", () => {
  expect(getSupabaseAuthStorageKey("https://project-ref.supabase.co")).toBe(AUTH_KEY);
});

function createStorage(options: {
  secure?: StoreDriver;
  legacy?: StoreDriver;
  chunkSize?: number;
  generations?: string[];
} = {}) {
  const secure = options.secure ?? memoryStore();
  const legacy = options.legacy ?? memoryStore({ [INSTALLATION_MARKER_KEY]: "1" });
  const generations = options.generations ?? ["generation-a", "generation-b", "generation-c"];
  const storage = new SecureSessionStorage({
    authStorageKey: AUTH_KEY,
    chunkSize: options.chunkSize ?? 4,
    generateId: () => generations.shift() ?? "generation-extra",
    legacyStorage: legacy,
    secureStore: secure,
  });
  return { legacy, secure, storage };
}

function findKey(values: Map<string, string>, suffix: string): string {
  const key = [...values.keys()].find((candidate) => candidate.endsWith(suffix));
  if (!key) throw new Error(`Missing key ending in ${suffix}`);
  return key;
}

describe("SecureSessionStorage", () => {
  it("round trips a short value", async () => {
    const { storage } = createStorage();
    await storage.setItem(AUTH_KEY, "session");
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("session");
  });

  it("round trips a multi-chunk value", async () => {
    const { secure, storage } = createStorage({ chunkSize: 3 });
    await storage.setItem(AUTH_KEY, "a-value-longer-than-one-chunk");
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("a-value-longer-than-one-chunk");
    expect([...secure.values.keys()].filter((key) => key.includes(".chunk.")).length).toBeGreaterThan(1);
  });

  it("preserves Unicode characters at chunk boundaries", async () => {
    const { storage } = createStorage({ chunkSize: 2 });
    await storage.setItem(AUTH_KEY, "a😀é𠜎z");
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("a😀é𠜎z");
  });

  it("removes the authoritative value and its chunks", async () => {
    const { secure, storage } = createStorage();
    await storage.setItem(AUTH_KEY, "session-value");
    await storage.removeItem(AUTH_KEY);
    await expect(storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect([...secure.values.keys()].filter((key) => key.includes("generation-a"))).toEqual([]);
  });

  it("retains deletion references until interrupted chunk cleanup succeeds after restart", async () => {
    const first = createStorage();
    await first.storage.setItem(AUTH_KEY, "session-value");
    first.secure.deleteItem.mockImplementation(async (key) => {
      if (key.includes("generation-a.chunk.0")) throw new Error("cleanup unavailable");
      first.secure.values.delete(key);
    });

    await expect(first.storage.removeItem(AUTH_KEY)).rejects.toThrow(/secure session cleanup failed/i);
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".manifest"))).toBe(false);
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".deletion"))).toBe(true);
    expect([...first.secure.values.keys()].some((key) => key.includes("generation-a.chunk.0"))).toBe(
      true,
    );

    first.secure.deleteItem.mockImplementation(async (key) => void first.secure.values.delete(key));
    const restarted = createStorage({ legacy: first.legacy, secure: first.secure });
    await expect(restarted.storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect([...first.secure.values.keys()].some((key) => key.includes("generation-a"))).toBe(false);
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".deletion"))).toBe(false);
  });

  it("replaces a generation and removes obsolete chunks", async () => {
    const { secure, storage } = createStorage();
    await storage.setItem(AUTH_KEY, "old-session");
    await storage.setItem(AUTH_KEY, "new-session");
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("new-session");
    expect([...secure.values.keys()].some((key) => key.includes("generation-a"))).toBe(false);
    expect([...secure.values.keys()].some((key) => key.includes("generation-b"))).toBe(true);
    expect([...secure.values.keys()].some((key) => key.endsWith(".pending"))).toBe(false);
    expect([...secure.values.keys()].some((key) => key.endsWith(".garbage"))).toBe(false);
  });

  it("switches the manifest only after every new chunk verifies", async () => {
    const { secure, storage } = createStorage();
    await storage.setItem(AUTH_KEY, "old-session");
    const manifestKey = findKey(secure.values, ".manifest");
    const oldManifest = secure.values.get(manifestKey);
    let manifestAtFirstNewChunk: string | undefined;
    secure.setItem.mockImplementation(async (key, value) => {
      if (key.includes("generation-b.chunk") && manifestAtFirstNewChunk === undefined) {
        manifestAtFirstNewChunk = secure.values.get(manifestKey);
      }
      secure.values.set(key, value);
    });
    await storage.setItem(AUTH_KEY, "new-session");
    expect(manifestAtFirstNewChunk).toBe(oldManifest);
    expect(secure.values.get(manifestKey)).not.toBe(oldManifest);
  });

  it("keeps the previous generation authoritative when a write is incomplete", async () => {
    const { secure, storage } = createStorage();
    await storage.setItem(AUTH_KEY, "old-session");
    secure.setItem.mockImplementation(async (key, value) => {
      if (key.includes("generation-b.chunk.1")) throw new Error("secure write failed");
      secure.values.set(key, value);
    });
    await expect(storage.setItem(AUTH_KEY, "replacement-session")).rejects.toThrow(
      "secure write failed",
    );
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("old-session");
    expect([...secure.values.keys()].some((key) => key.includes("generation-b"))).toBe(false);
  });

  it("retains a pending record until failed partial cleanup can be retried", async () => {
    const { secure, storage } = createStorage();
    await storage.setItem(AUTH_KEY, "old-session");
    secure.setItem.mockImplementation(async (key, value) => {
      if (key.includes("generation-b.chunk.1")) throw new Error("interrupted write");
      secure.values.set(key, value);
    });
    secure.deleteItem.mockImplementationOnce(async (key) => void secure.values.delete(key));
    secure.deleteItem.mockImplementationOnce(async () => {
      throw new Error("cleanup unavailable");
    });
    await expect(storage.setItem(AUTH_KEY, "replacement-session")).rejects.toThrow(
      "interrupted write",
    );
    expect([...secure.values.keys()].some((key) => key.endsWith(".pending"))).toBe(true);

    secure.setItem.mockImplementation(async (key, value) => void secure.values.set(key, value));
    secure.deleteItem.mockImplementation(async (key) => void secure.values.delete(key));
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("old-session");
    expect([...secure.values.keys()].some((key) => key.includes("generation-b"))).toBe(false);
    expect([...secure.values.keys()].some((key) => key.endsWith(".pending"))).toBe(false);
  });

  it("retains an obsolete-generation record until cleanup succeeds", async () => {
    const { secure, storage } = createStorage();
    await storage.setItem(AUTH_KEY, "old-session");
    secure.deleteItem.mockImplementation(async (key) => {
      if (key.includes("generation-a.chunk.0")) throw new Error("cleanup unavailable");
      secure.values.delete(key);
    });
    await storage.setItem(AUTH_KEY, "new-session");
    expect([...secure.values.keys()].some((key) => key.endsWith(".garbage"))).toBe(true);

    secure.deleteItem.mockImplementation(async (key) => void secure.values.delete(key));
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("new-session");
    expect([...secure.values.keys()].some((key) => key.includes("generation-a"))).toBe(false);
    expect([...secure.values.keys()].some((key) => key.endsWith(".garbage"))).toBe(false);
  });

  it("fails closed for corrupt manifests and missing chunks", async () => {
    const corrupt = createStorage();
    await corrupt.storage.setItem(AUTH_KEY, "session");
    const manifestKey = findKey(corrupt.secure.values, ".manifest");
    corrupt.secure.values.set(manifestKey, "not-json");
    await expect(corrupt.storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect(corrupt.secure.values.has(manifestKey)).toBe(false);

    const incomplete = createStorage();
    await incomplete.storage.setItem(AUTH_KEY, "session-value");
    incomplete.secure.values.delete(findKey(incomplete.secure.values, ".chunk.0"));
    await expect(incomplete.storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect([...incomplete.secure.values.keys()].some((key) => key.includes("generation-a"))).toBe(false);
  });

  it("retains a deletion reference when invalid-generation cleanup is interrupted", async () => {
    const first = createStorage();
    await first.storage.setItem(AUTH_KEY, "session-value");
    first.secure.values.delete(findKey(first.secure.values, ".chunk.1"));
    first.secure.deleteItem.mockImplementation(async (key) => {
      if (key.includes("generation-a.chunk.0")) throw new Error("cleanup unavailable");
      first.secure.values.delete(key);
    });

    await expect(first.storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".manifest"))).toBe(false);
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".deletion"))).toBe(true);

    first.secure.deleteItem.mockImplementation(async (key) => void first.secure.values.delete(key));
    const restarted = createStorage({ legacy: first.legacy, secure: first.secure });
    await expect(restarted.storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect([...first.secure.values.keys()].some((key) => key.includes("generation-a"))).toBe(false);
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".deletion"))).toBe(false);
  });
});

describe("legacy migration and installation state", () => {
  it("records a new installation when no legacy value exists", async () => {
    const legacy = memoryStore();
    const { storage } = createStorage({ legacy });
    await expect(storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect(legacy.values.get(INSTALLATION_MARKER_KEY)).toBe("1");
  });

  it("migrates and verifies a legacy session before deleting it", async () => {
    const legacy = memoryStore({ [AUTH_KEY]: "legacy-session" });
    const secure = memoryStore();
    let legacyPresentDuringSecureVerification = false;
    secure.getItem.mockImplementation(async (key) => {
      if (key.includes(".chunk.")) {
        legacyPresentDuringSecureVerification ||= legacy.values.has(AUTH_KEY);
      }
      return secure.values.get(key) ?? null;
    });
    const { storage } = createStorage({ legacy, secure });
    await expect(storage.getItem(AUTH_KEY)).resolves.toBe("legacy-session");
    expect(legacyPresentDuringSecureVerification).toBe(true);
    expect(legacy.values.has(AUTH_KEY)).toBe(false);
    expect(legacy.values.get(INSTALLATION_MARKER_KEY)).toBe("1");
  });

  it("retains the legacy value when a secure write fails", async () => {
    const legacy = memoryStore({ [AUTH_KEY]: "legacy-session" });
    const secure = memoryStore();
    secure.setItem.mockRejectedValue(new Error("secure store unavailable"));
    const { storage } = createStorage({ legacy, secure });
    await expect(storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect(legacy.values.get(AUTH_KEY)).toBe("legacy-session");
  });

  it("retains the legacy value when secure round-trip verification fails", async () => {
    const legacy = memoryStore({ [AUTH_KEY]: "legacy-session" });
    const secure = memoryStore();
    secure.getItem.mockImplementation(async (key) => {
      const value = secure.values.get(key) ?? null;
      return key.includes(".chunk.") && value ? `${value}corrupt` : value;
    });
    const { storage } = createStorage({ legacy, secure });
    await expect(storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect(legacy.values.get(AUTH_KEY)).toBe("legacy-session");
  });

  it("prefers a verified secure value and deletes a legacy duplicate", async () => {
    const first = createStorage();
    await first.storage.setItem(AUTH_KEY, "secure-session");
    first.legacy.values.set(AUTH_KEY, "legacy-session");
    const second = createStorage({ legacy: first.legacy, secure: first.secure });
    await expect(second.storage.getItem(AUTH_KEY)).resolves.toBe("secure-session");
    expect(first.legacy.values.has(AUTH_KEY)).toBe(false);
  });

  it("clears stale secure session material after reinstall", async () => {
    const first = createStorage();
    await first.storage.setItem(AUTH_KEY, "stale-session");
    first.legacy.values.delete(INSTALLATION_MARKER_KEY);
    const second = createStorage({ legacy: first.legacy, secure: first.secure });
    await expect(second.storage.getItem(AUTH_KEY)).resolves.toBeNull();
    expect([...first.secure.values.keys()].some((key) => key.endsWith(".manifest"))).toBe(false);
  });

  it("migrates legitimate legacy data instead of treating it as stale", async () => {
    const first = createStorage();
    await first.storage.setItem(AUTH_KEY, "stale-session");
    first.legacy.values.clear();
    first.legacy.values.set(AUTH_KEY, "current-install-session");
    const second = createStorage({ legacy: first.legacy, secure: first.secure });
    await expect(second.storage.getItem(AUTH_KEY)).resolves.toBe("current-install-session");
    expect(first.legacy.values.has(AUTH_KEY)).toBe(false);
  });
});

describe("Expo SecureStore driver", () => {
  it("uses device-only unlocked accessibility without biometric access control", async () => {
    const module = {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
      deleteItemAsync: jest.fn(async () => undefined),
      getItemAsync: jest.fn(async () => "value"),
      setItemAsync: jest.fn(async () => undefined),
    };
    const driver = createExpoSecureStoreDriver(module);
    await driver.setItem("key", "value");
    await driver.getItem("key");
    await driver.deleteItem("key");
    const expectedOptions = { keychainAccessible: 7 };
    expect(module.setItemAsync).toHaveBeenCalledWith("key", "value", expectedOptions);
    expect(module.getItemAsync).toHaveBeenCalledWith("key", expectedOptions);
    expect(module.deleteItemAsync).toHaveBeenCalledWith("key", expectedOptions);
    expect(expectedOptions).not.toHaveProperty("requireAuthentication");
  });
});
