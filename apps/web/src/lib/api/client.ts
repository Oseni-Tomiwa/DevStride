import type { SupabaseClient } from "@supabase/supabase-js";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ApiRequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .filter((item): item is { msg: string } => typeof item === "object" && item !== null && "msg" in item && typeof item.msg === "string")
      .map((item) => item.msg);
    return messages.length > 0 ? messages.join(", ") : undefined;
  }
  return undefined;
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let detail: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload: unknown = await response.json();
      detail = typeof payload === "object" && payload !== null && "detail" in payload ? payload.detail : undefined;
    } catch {
      detail = undefined;
    }
  } else {
    try {
      const text = await response.text();
      detail = text.trim() || undefined;
    } catch {
      detail = undefined;
    }
  }
  return new ApiError(
    response.status === 401
      ? "Authentication required."
      : response.status === 429
        ? "Too many AI requests. Please try again shortly."
        : errorMessage(detail) ?? "The API request failed.",
    response.status,
    detail,
    response.status === 429 ? Number(response.headers.get("retry-after")) || undefined : undefined,
  );
}

export function createAuthenticatedApiClient(supabase: SupabaseClient) {
  async function accessToken(): Promise<string> {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) throw new ApiError("Authentication is required.", 401);
    return token;
  }

  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const token = await accessToken();
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...options,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers,
      });
    } catch (cause) {
      throw new ApiError("The API could not be reached.", 0, cause);
    }
    if (!response.ok) throw await errorFromResponse(response);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async function stream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const token = await accessToken();
    const headers = new Headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers,
        signal,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new ApiError("The API could not be reached.", 0, cause);
    }
    if (!response.ok) throw await errorFromResponse(response);
    return response;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
    delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
    stream,
  };
}
