export const AUTH_SCHEME = "devstride";
export const AUTH_CONFIRM_REDIRECT_URL = `${AUTH_SCHEME}://auth/confirm`;
export const AUTH_RECOVERY_REDIRECT_URL = `${AUTH_SCHEME}://auth/recovery`;

export type ParsedAuthLink = {
  code: string;
  fingerprint: string;
  flowId: string | null;
  kind: "confirmation" | "recovery";
};

export type AuthLinkParseResult =
  | { ok: true; link: ParsedAuthLink }
  | { ok: false; reason: "malformed" | "missing_code" | "unsupported" };

const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,2048}$/;
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const ALLOWED_PARAMETERS = new Set(["code", "sb_flow_id"]);

export function getAuthRouteKind(value: string): "confirmation" | "recovery" | null {
  try {
    const url = new URL(value);
    if (url.protocol !== `${AUTH_SCHEME}:` || url.hostname !== "auth") return null;
    if (url.pathname === "/confirm") return "confirmation";
    if (url.pathname === "/recovery") return "recovery";
    return null;
  } catch {
    return null;
  }
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function parseAuthLink(value: string): AuthLinkParseResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (url.protocol !== `${AUTH_SCHEME}:` || url.hostname !== "auth") {
    return { ok: false, reason: "unsupported" };
  }

  const kind = getAuthRouteKind(value);
  if (!kind) return { ok: false, reason: "unsupported" };
  if (url.hash) return { ok: false, reason: "malformed" };
  if ([...url.searchParams.keys()].some((key) => !ALLOWED_PARAMETERS.has(key))) {
    return { ok: false, reason: "malformed" };
  }

  const codes = url.searchParams.getAll("code");
  if (codes.length === 0) return { ok: false, reason: "missing_code" };
  if (codes.length !== 1 || !CODE_PATTERN.test(codes[0])) {
    return { ok: false, reason: "malformed" };
  }

  const flowIds = url.searchParams.getAll("sb_flow_id");
  if (flowIds.length > 1 || (flowIds[0] !== undefined && !FLOW_ID_PATTERN.test(flowIds[0]))) {
    return { ok: false, reason: "malformed" };
  }
  const flowId = flowIds[0] ?? null;
  return {
    ok: true,
    link: {
      code: codes[0],
      fingerprint: fingerprint(`${kind}:${codes[0]}:${flowId ?? ""}`),
      flowId,
      kind,
    },
  };
}
