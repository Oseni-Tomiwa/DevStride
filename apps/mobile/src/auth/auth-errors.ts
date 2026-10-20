export type AuthOperation = "exchange" | "recovery" | "resend" | "sign_in" | "sign_up";

export type SafeAuthFailure = {
  kind:
    | "generic_signup"
    | "invalid_credentials"
    | "invalid_link"
    | "network"
    | "rate_limited"
    | "service";
  message: string;
};

type AuthErrorLike = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

function errorShape(error: unknown): AuthErrorLike {
  return error && typeof error === "object" ? (error as AuthErrorLike) : {};
}

export function classifyAuthFailure(
  error: unknown,
  operation: AuthOperation,
): SafeAuthFailure {
  const { code, name, status } = errorShape(error);

  if (error instanceof TypeError) {
    return {
      kind: "network",
      message: "Unable to reach DevStride. Check your connection and try again.",
    };
  }

  if (
    operation === "exchange" &&
    (name === "AuthPKCECodeVerifierMissingError" ||
      code === "bad_code_verifier" ||
      code === "flow_state_not_found" ||
      code === "flow_state_expired")
  ) {
    return {
      kind: "invalid_link",
      message: "This link cannot be completed on this device. Request a new email on this device.",
    };
  }

  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  ) {
    return {
      kind: "rate_limited",
      message: "Too many email requests. Wait a while before trying again.",
    };
  }

  if (
    operation === "sign_up" &&
    (code === "email_exists" || code === "user_already_exists")
  ) {
    return {
      kind: "generic_signup",
      message: "Check your email for the next step if an account can be created or verified.",
    };
  }

  if (operation === "sign_in" && code === "invalid_credentials") {
    return { kind: "invalid_credentials", message: "Email or password is incorrect." };
  }

  if (operation === "sign_in" && code === "email_not_confirmed") {
    return { kind: "invalid_credentials", message: "Confirm your email before signing in." };
  }

  if (
    code === "request_timeout" ||
    (typeof status === "number" && status >= 500)
  ) {
    return {
      kind: "service",
      message: "Authentication is temporarily unavailable. Try again shortly.",
    };
  }

  if (operation === "exchange") {
    return {
      kind: "invalid_link",
      message: "This authentication link is invalid or expired. Request a new email and try again.",
    };
  }

  return {
    kind: "service",
    message: "Authentication is temporarily unavailable. Try again shortly.",
  };
}
