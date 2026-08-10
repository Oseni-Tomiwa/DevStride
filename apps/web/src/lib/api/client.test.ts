import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthenticatedApiClient } from "./client";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("authenticated API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the current Supabase access token as a bearer token", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "profile-id" }), { status: 201 }),
    );
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-access-token" } },
          error: null,
        }),
      },
    };

    await createAuthenticatedApiClient(supabase as never).post("/api/v1/onboarding", {
      display_name: "Ada",
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toBeInstanceOf(Headers);
    expect((request.headers as Headers).get("Authorization")).toBe(
      "Bearer test-access-token",
    );
    expect(request.body).toBe(JSON.stringify({ display_name: "Ada" }));
  });

  it("rejects requests when there is no authenticated session", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    };

    await expect(
      createAuthenticatedApiClient(supabase as never).get("/api/v1/profile/me"),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens an authenticated SSE stream with only the request body", async () => {
    fetchMock.mockResolvedValue(
      new Response("event: done\\ndata: {}\\n\\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-access-token" } },
          error: null,
        }),
      },
    };

    await createAuthenticatedApiClient(supabase as never).stream(
      "/api/v1/conversations/conversation-id/stream",
      { content: "Hello" },
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((request.headers as Headers).get("Authorization")).toBe(
      "Bearer test-access-token",
    );
    expect((request.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(request.body).toBe(JSON.stringify({ content: "Hello" }));
  });
});


function authenticatedClient() {
  return createAuthenticatedApiClient({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-access-token" } },
        error: null,
      }),
    },
  } as never);
}

it("turns a JSON 401 into an authentication error", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  );

  await expect(authenticatedClient().get("/api/v1/profile/me"))
    .rejects.toMatchObject({ status: 401, message: "Authentication required." });
});

it("turns a plain-text 401 into an authentication error without JSON parsing", async () => {
  fetchMock.mockResolvedValue(
    new Response("401: Not authenticated", {
      status: 401,
      headers: { "content-type": "text/plain" },
    }),
  );

  await expect(authenticatedClient().get("/api/v1/profile/me"))
    .rejects.toMatchObject({ status: 401, message: "Authentication required." });
});

it("turns a rate limit response into a retryable user-facing error", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: "Too many AI requests" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    }),
  );

  await expect(authenticatedClient().get("/api/v1/conversations/conversation-id/summary"))
    .rejects.toMatchObject({
      status: 429,
      message: "Too many AI requests. Please try again shortly.",
      retryAfterSeconds: 60,
    });
});
