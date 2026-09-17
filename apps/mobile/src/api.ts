import {
  communicationGoals,
  currentLevels,
  feedbackPreferences,
  targetRoles,
  type AuthenticatedUser,
  type Profile,
} from "./types";

export type MobileApiErrorKind =
  | "unauthorized"
  | "profile_missing"
  | "unreachable"
  | "invalid_response"
  | "request_failed";

export class MobileApiError extends Error {
  constructor(
    public readonly kind: MobileApiErrorKind,
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

type ApiOptions = {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function oneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isNullableString(value.email)
  );
}

function isProfile(value: unknown): value is Profile {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.user_id === "string" &&
    typeof value.display_name === "string" &&
    oneOf(currentLevels, value.current_level) &&
    oneOf(targetRoles, value.target_role) &&
    Array.isArray(value.preferred_stack) &&
    value.preferred_stack.length > 0 &&
    value.preferred_stack.every((item) => typeof item === "string" && item.length > 0) &&
    oneOf(communicationGoals, value.communication_goal) &&
    oneOf(feedbackPreferences, value.feedback_preference) &&
    typeof value.onboarding_completed === "boolean" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

export function createDevStrideApi({ apiBaseUrl, getAccessToken, fetchImpl = fetch }: ApiOptions) {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");

  async function getJson<T>(path: string, validator: (value: unknown) => value is T): Promise<T> {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new MobileApiError(
        "unauthorized",
        "Your session expired. Sign in again.",
        null,
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      throw new MobileApiError(
        "unreachable",
        "Unable to reach DevStride. Check your connection and try again.",
        null,
      );
    }

    if (response.status === 401) {
      throw new MobileApiError(
        "unauthorized",
        "Your session expired. Sign in again.",
        response.status,
      );
    }
    if (response.status === 404 && path === "/api/v1/profile/me") {
      throw new MobileApiError(
        "profile_missing",
        "A DevStride profile is required before using the mobile app.",
        response.status,
      );
    }
    if (!response.ok) {
      throw new MobileApiError(
        "request_failed",
        "DevStride could not complete this request. Try again.",
        response.status,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MobileApiError(
        "invalid_response",
        "DevStride returned an invalid response.",
        response.status,
      );
    }
    if (!validator(body)) {
      throw new MobileApiError(
        "invalid_response",
        "DevStride returned an invalid response.",
        response.status,
      );
    }
    return body;
  }

  return {
    getCurrentUser: () => getJson("/api/v1/auth/me", isAuthenticatedUser),
    getProfile: () => getJson("/api/v1/profile/me", isProfile),
  };
}

export type DevStrideApi = ReturnType<typeof createDevStrideApi>;
