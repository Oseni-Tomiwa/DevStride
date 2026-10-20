export type MobileAuthBridgeOptions = {
  siteOrigin: string;
  supabaseOrigin: string;
};

export type MobileAuthBridgeResult =
  | { ok: true; kind: "confirmation" | "recovery"; verificationUrl: string }
  | { ok: false; reason: "invalid_link" };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,2048}$/;
const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const VERIFY_PARAMETERS = new Set(["redirect_to", "token", "type"]);
const MOBILE_PARAMETERS = new Set(["sb_flow_id"]);
const WEB_PARAMETERS = new Set(["next", "returnTo"]);

function hasOnlyParameters(url: URL, allowed: ReadonlySet<string>): boolean {
  return [...url.searchParams.keys()].every((key) => allowed.has(key));
}

function hasOneValue(url: URL, name: string): boolean {
  return url.searchParams.getAll(name).length === 1;
}

function isAllowedMobileDestination(
  destination: URL,
  kind: "confirmation" | "recovery",
): boolean {
  if (
    destination.protocol !== "devstride:" ||
    destination.hostname !== "auth" ||
    destination.username ||
    destination.password ||
    destination.port ||
    destination.hash ||
    !hasOnlyParameters(destination, MOBILE_PARAMETERS)
  ) {
    return false;
  }

  const expectedPath = kind === "confirmation" ? "/confirm" : "/recovery";
  if (destination.pathname !== expectedPath) return false;

  const flowIds = destination.searchParams.getAll("sb_flow_id");
  return flowIds.length <= 1 && (flowIds.length === 0 || FLOW_ID_PATTERN.test(flowIds[0]));
}

function isAllowedWebDestination(destination: URL, siteOrigin: string): boolean {
  if (
    destination.origin !== siteOrigin ||
    destination.pathname !== "/auth/callback" ||
    destination.hash ||
    destination.username ||
    destination.password ||
    !hasOnlyParameters(destination, WEB_PARAMETERS)
  ) {
    return false;
  }

  return (
    destination.searchParams.getAll("next").length <= 1 &&
    destination.searchParams.getAll("returnTo").length <= 1
  );
}

export function parseMobileAuthBridgeFragment(
  fragment: string,
  options: MobileAuthBridgeOptions,
): MobileAuthBridgeResult {
  if (!fragment.startsWith("#") || fragment.length < 2) {
    return { ok: false, reason: "invalid_link" };
  }

  try {
    const payload = fragment.slice(1);
    let verification: URL;
    try {
      verification = new URL(payload);
    } catch {
      verification = new URL(decodeURIComponent(payload));
    }
    if (
      verification.origin !== options.supabaseOrigin ||
      verification.pathname !== "/auth/v1/verify" ||
      verification.hash ||
      verification.username ||
      verification.password ||
      !hasOnlyParameters(verification, VERIFY_PARAMETERS) ||
      !hasOneValue(verification, "token") ||
      !hasOneValue(verification, "type") ||
      !hasOneValue(verification, "redirect_to")
    ) {
      return { ok: false, reason: "invalid_link" };
    }

    const token = verification.searchParams.get("token") ?? "";
    const type = verification.searchParams.get("type");
    const kind = type === "recovery" ? "recovery" : type === "signup" || type === "email" ? "confirmation" : null;
    if (!kind || !TOKEN_PATTERN.test(token)) {
      return { ok: false, reason: "invalid_link" };
    }

    const destination = new URL(verification.searchParams.get("redirect_to") ?? "");
    if (
      !isAllowedMobileDestination(destination, kind) &&
      !isAllowedWebDestination(destination, options.siteOrigin)
    ) {
      return { ok: false, reason: "invalid_link" };
    }

    return { ok: true, kind, verificationUrl: verification.toString() };
  } catch {
    return { ok: false, reason: "invalid_link" };
  }
}
