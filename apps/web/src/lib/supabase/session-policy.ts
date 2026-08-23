export const SESSION_POLICY_COOKIE = "devstride-session-policy";
export const INACTIVITY_TIMEOUT_SECONDS = 24 * 60 * 60;
export const ABSOLUTE_SESSION_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;
const TOUCH_INTERVAL_SECONDS = 5 * 60;
const POLICY_VERSION = "v1";

export type SessionPolicyState = {
  issuedAt: number;
  lastActivityAt: number;
};

export type SessionPolicyResult =
  | { status: "active"; state: SessionPolicyState }
  | { status: "missing" | "invalid" | "inactive" | "absolute" };

let developmentSecret: string | undefined;

function getSecret(): string | null {
  const configured = process.env.SESSION_POLICY_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  developmentSecret ??= `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  return developmentSecret;
}

function encode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const decoded = decode(signature);
  return decoded ? crypto.subtle.verify("HMAC", key, decoded as BufferSource, new TextEncoder().encode(payload)) : false;
}

export async function createSessionPolicyCookie(nowSeconds = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const payload = `${POLICY_VERSION}.${nowSeconds}.${nowSeconds}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function readSessionPolicy(value: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): Promise<SessionPolicyResult> {
  if (!value) return { status: "missing" };
  const secret = getSecret();
  if (!secret) return { status: "invalid" };

  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== POLICY_VERSION) return { status: "invalid" };
  const issuedAt = Number(parts[1]);
  const lastActivityAt = Number(parts[2]);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(lastActivityAt) || issuedAt > nowSeconds + 300 || lastActivityAt > nowSeconds + 300 || lastActivityAt < issuedAt) {
    return { status: "invalid" };
  }
  if (!(await verifySignature(parts.slice(0, 3).join("."), parts[3], secret))) return { status: "invalid" };
  if (nowSeconds - issuedAt >= ABSOLUTE_SESSION_TIMEOUT_SECONDS) return { status: "absolute" };
  if (nowSeconds - lastActivityAt >= INACTIVITY_TIMEOUT_SECONDS) return { status: "inactive" };
  return { status: "active", state: { issuedAt, lastActivityAt } };
}

export async function touchSessionPolicy(state: SessionPolicyState, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string | null> {
  if (nowSeconds - state.lastActivityAt < TOUCH_INTERVAL_SECONDS) return null;
  const secret = getSecret();
  if (!secret) return null;
  const payload = `${POLICY_VERSION}.${state.issuedAt}.${nowSeconds}`;
  return `${payload}.${await sign(payload, secret)}`;
}
