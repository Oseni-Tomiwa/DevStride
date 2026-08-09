import type { SupabaseClient } from "@supabase/supabase-js";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .filter((item): item is { msg: string } => {
        return typeof item === "object" && item !== null && "msg" in item &&
          typeof item.msg === "string";
      })
      .map((item) => item.msg);
    return messages.length > 0 ? messages.join(", ") : undefined;
  }

  return undefined;
}

export function createAuthenticatedApiClient(supabase: SupabaseClient) {
  async function request<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (sessionError || !accessToken) {
      throw new ApiError("Authentication is required.", 401);
    }

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

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

    if (!response.ok) {
      let detail: unknown;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          const payload: unknown = await response.json();
          detail = typeof payload === "object" && payload !== null && "detail" in payload
            ? payload.detail
            : undefined;
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

      throw new ApiError(
        response.status === 401 ? "Authentication required." :
          errorMessage(detail) ?? "The API request failed.",
        response.status,
        detail,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
    delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}
