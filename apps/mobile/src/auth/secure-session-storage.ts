export const INSTALLATION_MARKER_KEY = "devstride.mobile.installation.v1";

const FORMAT_VERSION = 1;
const DEFAULT_CHUNK_SIZE = 375;
const MAX_CHUNKS = 512;

export type AsyncStringStore = {
  deleteItem: (key: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type ExpoSecureStoreModule = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: number;
  deleteItemAsync: (key: string, options?: { keychainAccessible?: number }) => Promise<void>;
  getItemAsync: (
    key: string,
    options?: { keychainAccessible?: number },
  ) => Promise<string | null>;
  setItemAsync: (
    key: string,
    value: string,
    options?: { keychainAccessible?: number },
  ) => Promise<void>;
};

type Manifest = {
  version: 1;
  generation: string;
  chunkCount: number;
  length: number;
  checksum: string;
};

type DeletionRecord = {
  version: 1;
  generations: Manifest[];
};

type SecureSessionStorageOptions = {
  authStorageKey: string;
  chunkSize?: number;
  generateId?: () => string;
  legacyStorage: AsyncStringStore;
  secureStore: AsyncStringStore;
};

export function createExpoSecureStoreDriver(module: ExpoSecureStoreModule): AsyncStringStore {
  const options = { keychainAccessible: module.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return {
    deleteItem: (key) => module.deleteItemAsync(key, options),
    getItem: (key) => module.getItemAsync(key, options),
    setItem: (key, value) => module.setItemAsync(key, value, options),
  };
}

export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function splitValue(value: string, chunkSize: number): string[] {
  const codePoints = Array.from(value);
  if (codePoints.length === 0) return [""];
  const chunks: string[] = [];
  for (let index = 0; index < codePoints.length; index += chunkSize) {
    chunks.push(codePoints.slice(index, index + chunkSize).join(""));
  }
  return chunks;
}

function parseManifest(value: string | null): Manifest | null {
  if (!value) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return null;
    const manifest = candidate as Partial<Manifest>;
    if (
      manifest.version !== FORMAT_VERSION ||
      typeof manifest.generation !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(manifest.generation) ||
      !Number.isInteger(manifest.chunkCount) ||
      (manifest.chunkCount ?? 0) < 1 ||
      (manifest.chunkCount ?? 0) > MAX_CHUNKS ||
      !Number.isInteger(manifest.length) ||
      (manifest.length ?? -1) < 0 ||
      typeof manifest.checksum !== "string" ||
      !/^[a-f0-9]{8}$/.test(manifest.checksum)
    ) {
      return null;
    }
    return manifest as Manifest;
  } catch {
    return null;
  }
}

function parseDeletionRecord(value: string | null): DeletionRecord | null {
  if (!value) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate as Partial<DeletionRecord>;
    if (
      record.version !== FORMAT_VERSION ||
      !Array.isArray(record.generations) ||
      record.generations.length > 8
    ) {
      return null;
    }
    const generations = record.generations
      .map((manifest) => parseManifest(JSON.stringify(manifest)))
      .filter((manifest): manifest is Manifest => manifest !== null);
    return generations.length === record.generations.length
      ? { version: FORMAT_VERSION, generations }
      : null;
  } catch {
    return null;
  }
}

function storagePrefix(key: string): string {
  const safeKey = key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  return `devstride.secure.v1.${safeKey}.${checksum(key)}`;
}

function defaultGenerationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class SecureSessionStorage {
  private readonly authStorageKey: string;
  private readonly chunkSize: number;
  private readonly generateId: () => string;
  private readonly legacyStorage: AsyncStringStore;
  private readonly secureStore: AsyncStringStore;
  private initialized = false;
  private operation: Promise<void> = Promise.resolve();

  constructor(options: SecureSessionStorageOptions) {
    this.authStorageKey = options.authStorageKey;
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.generateId = options.generateId ?? defaultGenerationId;
    this.legacyStorage = options.legacyStorage;
    this.secureStore = options.secureStore;
    if (!Number.isInteger(this.chunkSize) || this.chunkSize < 1) {
      throw new Error("Secure storage chunk size must be a positive integer.");
    }
  }

  getItem(key: string): Promise<string | null> {
    return this.serialize(async () => {
      if (!(await this.ensureInstallationState())) return null;
      return this.readValue(key);
    });
  }

  setItem(key: string, value: string): Promise<void> {
    return this.serialize(async () => {
      if (!(await this.ensureInstallationState())) {
        throw new Error("Secure session storage is unavailable.");
      }
      await this.writeValue(key, value);
      if (key === this.authStorageKey) await this.legacyStorage.deleteItem(key);
    });
  }

  removeItem(key: string): Promise<void> {
    return this.serialize(async () => {
      await this.removeValue(key);
      if (key === this.authStorageKey) await this.legacyStorage.deleteItem(key);
    });
  }

  clearAuthData(): Promise<void> {
    return this.removeItem(this.authStorageKey);
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.operation.then(work, work);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private keys(key: string) {
    const prefix = storagePrefix(key);
    return {
      deletion: `${prefix}.deletion`,
      garbage: `${prefix}.garbage`,
      manifest: `${prefix}.manifest`,
      pending: `${prefix}.pending`,
      chunk: (generation: string, index: number) => `${prefix}.${generation}.chunk.${index}`,
    };
  }

  private async getManifest(key: string): Promise<Manifest | null> {
    const keys = this.keys(key);
    const raw = await this.secureStore.getItem(keys.manifest);
    if (raw === null) return null;
    const manifest = parseManifest(raw);
    if (!manifest) await this.bestEffort(() => this.secureStore.deleteItem(keys.manifest));
    return manifest;
  }

  private async deleteGeneration(key: string, manifest: Manifest): Promise<void> {
    const keys = this.keys(key);
    await Promise.all(
      Array.from({ length: manifest.chunkCount }, (_, index) =>
        this.secureStore.deleteItem(keys.chunk(manifest.generation, index)),
      ),
    );
  }

  private async cleanupRecord(
    key: string,
    recordKey: string,
    current: Manifest | null,
  ): Promise<void> {
    const raw = await this.secureStore.getItem(recordKey);
    if (raw === null) return;
    const recorded = parseManifest(raw);
    if (recorded && recorded.generation !== current?.generation) {
      await this.deleteGeneration(key, recorded);
    }
    await this.secureStore.deleteItem(recordKey);
  }

  private async cleanupRecoveryRecords(key: string): Promise<void> {
    const keys = this.keys(key);
    if (!(await this.cleanupDeletionRecord(key))) {
      throw new Error("Secure session cleanup failed.");
    }
    const current = await this.getManifest(key);
    await this.cleanupRecord(key, keys.pending, current);
    await this.cleanupRecord(key, keys.garbage, current);
  }

  private async cleanupDeletionRecord(key: string): Promise<boolean> {
    const keys = this.keys(key);
    const raw = await this.secureStore.getItem(keys.deletion);
    if (raw === null) return true;
    const record = parseDeletionRecord(raw);
    if (!record) return false;
    try {
      // The durable deletion record is written first. Authority is removed before
      // chunks so an interrupted cleanup always fails closed and can be retried.
      await this.secureStore.deleteItem(keys.manifest);
      await this.secureStore.deleteItem(keys.pending);
      await this.secureStore.deleteItem(keys.garbage);
      const seen = new Set<string>();
      for (const manifest of record.generations) {
        if (seen.has(manifest.generation)) continue;
        seen.add(manifest.generation);
        await this.deleteGeneration(key, manifest);
      }
      await this.secureStore.deleteItem(keys.deletion);
      return true;
    } catch {
      return false;
    }
  }

  private async readGeneration(key: string, manifest: Manifest): Promise<string | null> {
    const keys = this.keys(key);
    const chunks: string[] = [];
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const chunk = await this.secureStore.getItem(keys.chunk(manifest.generation, index));
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    const value = chunks.join("");
    return value.length === manifest.length && checksum(value) === manifest.checksum ? value : null;
  }

  private async readValue(key: string): Promise<string | null> {
    await this.cleanupRecoveryRecords(key);
    const manifest = await this.getManifest(key);
    if (!manifest) return null;
    const value = await this.readGeneration(key, manifest);
    if (value !== null) return value;
    const keys = this.keys(key);
    try {
      await this.secureStore.setItem(
        keys.deletion,
        JSON.stringify({ version: FORMAT_VERSION, generations: [manifest] } satisfies DeletionRecord),
      );
      await this.cleanupDeletionRecord(key);
    } catch {
      // Keep the manifest authoritative when no durable deletion record could be written.
    }
    return null;
  }

  private async writeValue(key: string, value: string): Promise<void> {
    await this.cleanupRecoveryRecords(key);
    const keys = this.keys(key);
    const previous = await this.getManifest(key);
    const chunks = splitValue(value, this.chunkSize);
    if (chunks.length > MAX_CHUNKS) throw new Error("Secure session value is too large.");
    let generation = this.generateId();
    for (let attempt = 0; generation === previous?.generation && attempt < 8; attempt += 1) {
      generation = this.generateId();
    }
    if (!/^[A-Za-z0-9_-]+$/.test(generation) || generation === previous?.generation) {
      throw new Error("Unable to allocate a secure storage generation.");
    }
    const next: Manifest = {
      version: FORMAT_VERSION,
      generation,
      chunkCount: chunks.length,
      length: value.length,
      checksum: checksum(value),
    };
    const encodedNext = JSON.stringify(next);
    let committed = false;
    try {
      await this.secureStore.setItem(keys.pending, encodedNext);
      for (let index = 0; index < chunks.length; index += 1) {
        await this.secureStore.setItem(keys.chunk(next.generation, index), chunks[index]);
      }
      if ((await this.readGeneration(key, next)) !== value) {
        throw new Error("Secure session verification failed.");
      }
      if (previous) await this.secureStore.setItem(keys.garbage, JSON.stringify(previous));
      await this.secureStore.setItem(keys.manifest, encodedNext);
      committed = true;
    } finally {
      if (!committed) {
        await this.bestEffort(async () => {
          await this.deleteGeneration(key, next);
          await this.secureStore.deleteItem(keys.pending);
        });
        if (previous) await this.bestEffort(() => this.secureStore.deleteItem(keys.garbage));
      }
    }
    await this.bestEffort(() => this.secureStore.deleteItem(keys.pending));
    if (previous) {
      await this.bestEffort(async () => {
        await this.deleteGeneration(key, previous);
        await this.secureStore.deleteItem(keys.garbage);
      });
    }
  }

  private async removeValue(key: string): Promise<void> {
    const keys = this.keys(key);
    const references = await Promise.all([
      this.secureStore.getItem(keys.manifest),
      this.secureStore.getItem(keys.pending),
      this.secureStore.getItem(keys.garbage),
      this.secureStore.getItem(keys.deletion),
    ]);
    const generations: Manifest[] = [];
    for (const reference of references.slice(0, 3)) {
      const manifest = parseManifest(reference);
      if (manifest) generations.push(manifest);
    }
    const priorDeletion = parseDeletionRecord(references[3]);
    if (priorDeletion) generations.push(...priorDeletion.generations);
    const record: DeletionRecord = { version: FORMAT_VERSION, generations };
    await this.secureStore.setItem(keys.deletion, JSON.stringify(record));
    if (!(await this.cleanupDeletionRecord(key))) {
      throw new Error("Secure session cleanup failed.");
    }
  }

  private async migrateLegacyValue(value: string): Promise<boolean> {
    try {
      await this.writeValue(this.authStorageKey, value);
      if ((await this.readValue(this.authStorageKey)) !== value) return false;
      await this.legacyStorage.setItem(INSTALLATION_MARKER_KEY, "1");
      await this.legacyStorage.deleteItem(this.authStorageKey);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureInstallationState(): Promise<boolean> {
    if (this.initialized) return true;
    try {
      const [marker, legacyValue] = await Promise.all([
        this.legacyStorage.getItem(INSTALLATION_MARKER_KEY),
        this.legacyStorage.getItem(this.authStorageKey),
      ]);
      const secureValue = await this.readValue(this.authStorageKey);

      if (marker === "1") {
        if (secureValue !== null) {
          if (legacyValue !== null) await this.legacyStorage.deleteItem(this.authStorageKey);
          this.initialized = true;
          return true;
        }
        if (legacyValue !== null && !(await this.migrateLegacyValue(legacyValue))) return false;
        this.initialized = true;
        return true;
      }

      if (legacyValue !== null) {
        if (secureValue === legacyValue) {
          await this.legacyStorage.setItem(INSTALLATION_MARKER_KEY, "1");
          await this.legacyStorage.deleteItem(this.authStorageKey);
          this.initialized = true;
          return true;
        }
        if (!(await this.migrateLegacyValue(legacyValue))) return false;
        this.initialized = true;
        return true;
      }

      if (secureValue !== null) await this.removeValue(this.authStorageKey);
      await this.legacyStorage.setItem(INSTALLATION_MARKER_KEY, "1");
      this.initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  private async bestEffort(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch {
      // Cleanup is retried from tracked pending/garbage records on the next operation.
    }
  }
}
