import * as ExpoCrypto from "expo-crypto";

type Digest = (algorithm: string, data: BufferSource) => Promise<ArrayBuffer>;
type CryptoSource = {
  digest: Digest;
  getRandomValues: Crypto["getRandomValues"];
};

function defineValue(target: object, property: string, value: unknown) {
  Object.defineProperty(target, property, {
    configurable: true,
    enumerable: true,
    value,
  });
}

export function createPkceCrypto(crypto: Crypto, digest: Digest): Crypto {
  if (typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure random values are unavailable");
  }

  if (typeof crypto.subtle?.digest !== "function") {
    const subtle = {
      digest(algorithm: AlgorithmIdentifier, data: BufferSource) {
        const name = typeof algorithm === "string" ? algorithm : algorithm.name;
        if (name.toUpperCase() !== "SHA-256") {
          return Promise.reject(new Error("Unsupported digest algorithm"));
        }
        return digest("SHA-256", data);
      },
    } as SubtleCrypto;
    defineValue(crypto, "subtle", subtle);
  }

  return crypto;
}

export function installPkceCrypto(
  target: typeof globalThis = globalThis,
  source: CryptoSource = {
    digest: (algorithm, data) =>
      ExpoCrypto.digest(algorithm as ExpoCrypto.CryptoDigestAlgorithm, data),
    getRandomValues: ((value) =>
      ExpoCrypto.getRandomValues(
        value as unknown as Parameters<typeof ExpoCrypto.getRandomValues>[0],
      )) as Crypto["getRandomValues"],
  },
): void {
  const crypto = target.crypto ?? ({ getRandomValues: source.getRandomValues } as Crypto);
  if (typeof crypto.getRandomValues !== "function") {
    defineValue(crypto, "getRandomValues", source.getRandomValues);
  }
  createPkceCrypto(crypto, source.digest);
  if (!target.crypto) defineValue(target, "crypto", crypto);
}
