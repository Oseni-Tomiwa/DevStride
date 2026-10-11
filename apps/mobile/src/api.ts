import { fetch as expoFetch } from "expo/fetch";

import {
  communicationGoals,
  currentLevels,
  feedbackPreferences,
  targetRoles,
  type AuthenticatedUser,
  type Profile,
} from "./types";
import {
  createGeneralConversationInput,
  createMessageInput,
  isConversation,
  isConversationList,
  isMessageList,
} from "./conversations/contracts";

export type MobileApiErrorKind =
  | "unauthorized"
  | "profile_missing"
  | "unreachable"
  | "invalid_response"
  | "request_failed"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "cancelled";

export class MobileApiError extends Error {
  constructor(
    public readonly kind: MobileApiErrorKind,
    message: string,
    public readonly status: number | null,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

type ApiOptions = {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof globalThis.fetch;
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

export function createDevStrideApi({
  apiBaseUrl,
  getAccessToken,
  fetchImpl = expoFetch as unknown as typeof globalThis.fetch,
}: ApiOptions) {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");

  async function request(path: string, init: RequestInit): Promise<Response> {
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
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      if (init.signal?.aborted) {
        throw new MobileApiError("cancelled", "The request was cancelled.", null);
      }
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
    if (response.status === 404) {
      throw new MobileApiError("not_found", "The requested conversation was not found.", 404);
    }
    if (response.status === 409) {
      throw new MobileApiError("conflict", "This conversation request cannot be completed.", 409);
    }
    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
      throw new MobileApiError(
        "rate_limited",
        "Too many requests. Try again shortly.",
        429,
        Number.isFinite(retryAfter) ? retryAfter : null,
      );
    }
    if (!response.ok) {
      throw new MobileApiError(
        "request_failed",
        "DevStride could not complete this request. Try again.",
        response.status,
      );
    }

    return response;
  }

  async function requestJson<T>(
    path: string,
    init: RequestInit,
    validator: (value: unknown) => value is T,
  ): Promise<T> {
    const response = await request(path, init);
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

  function getJson<T>(path: string, validator: (value: unknown) => value is T): Promise<T> {
    return requestJson(path, { method: "GET", headers: { Accept: "application/json" } }, validator);
  }

  function postJson<T>(
    path: string,
    body: unknown,
    validator: (value: unknown) => value is T,
  ): Promise<T> {
    return requestJson(
      path,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      validator,
    );
  }

  async function openStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await request(path, {
      method: "POST",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("text/event-stream")) {
      throw new MobileApiError(
        "invalid_response",
        "DevStride returned an invalid streaming response.",
        response.status,
      );
    }
    return response;
  }

  return {
    getCurrentUser: () => getJson("/api/v1/auth/me", isAuthenticatedUser),
    getProfile: () => getJson("/api/v1/profile/me", isProfile),
    listConversations: () => getJson("/api/v1/conversations", isConversationList),
    createGeneralConversation: (title: string) =>
      postJson("/api/v1/conversations", createGeneralConversationInput(title), isConversation),
    getConversation: (conversationId: string) =>
      getJson(`/api/v1/conversations/${conversationId}`, isConversation),
    listMessages: (conversationId: string) =>
      getJson(`/api/v1/conversations/${conversationId}/messages`, isMessageList),
    streamConversation: (conversationId: string, content: string, signal?: AbortSignal) =>
      openStream(
        `/api/v1/conversations/${conversationId}/stream`,
        createMessageInput(content),
        signal,
      ),
    retryMessage: (conversationId: string, messageId: string, signal?: AbortSignal) =>
      openStream(
        `/api/v1/conversations/${conversationId}/messages/${messageId}/retry`,
        undefined,
        signal,
      ),
  };
}

export type DevStrideApi = ReturnType<typeof createDevStrideApi>;
