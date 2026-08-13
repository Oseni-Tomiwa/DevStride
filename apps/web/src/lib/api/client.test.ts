import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthenticatedApiClient } from "./client";

const fetchMock = vi.fn();
const SDP_OFFER = "v=0\no=- 46117327 2 IN IP4 127.0.0.1\ns=-\nt=0 0\n";

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
        refreshSession: vi.fn().mockResolvedValue({
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

  it("does not send raw SDP when authentication is unavailable", async () => {
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    };

    await expect(
      createAuthenticatedApiClient(supabase as never).rawPost(
        "/api/v1/realtime/sessions/conversation-id/connect",
        SDP_OFFER,
        "application/sdp",
      ),
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

  it("sends raw SDP through the authenticated API client", async () => {
    fetchMock.mockResolvedValue(new Response("v=0\no=- answer", { status: 201 }));
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-access-token" } },
          error: null,
        }),
      },
    };

    await createAuthenticatedApiClient(supabase as never).rawPost(
      "/api/v1/realtime/sessions/conversation-id/connect",
      SDP_OFFER,
      "application/sdp",
    );

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((request.headers as Headers).get("Authorization")).toBe(
      "Bearer test-access-token",
    );
    expect((request.headers as Headers).get("Content-Type")).toBe("application/sdp");
    expect(request.body).toBe(SDP_OFFER);
  });

  it("exposes the raw SDP response without JSON parsing", async () => {
    fetchMock.mockResolvedValue(
      new Response("v=0\no=- answer", {
        status: 201,
        headers: { "content-type": "application/sdp" },
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

    const response = await createAuthenticatedApiClient(supabase as never).rawPostResponse(
      "/api/v1/realtime/sessions/conversation-id/connect",
      SDP_OFFER,
      "application/sdp",
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/sdp");
    expect(await response.text()).toBe("v=0\no=- answer");
  });

  it("refreshes an expired session before sending raw SDP", async () => {
    fetchMock.mockResolvedValue(new Response("v=0\no=- answer", { status: 201 }));
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "expired-token", expires_at: 1 } },
          error: null,
        }),
        refreshSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "refreshed-token", expires_at: 9999999999 } },
          error: null,
        }),
      },
    };

    await createAuthenticatedApiClient(supabase as never).rawPost(
      "/api/v1/realtime/sessions/conversation-id/connect",
      SDP_OFFER,
      "application/sdp",
    );

    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((request.headers as Headers).get("Authorization")).toBe("Bearer refreshed-token");
  });

  it("refreshes once when a stale session receives a 401", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("Authentication required", { status: 401 }))
      .mockResolvedValueOnce(new Response("v=0\no=- answer", { status: 201 }));
    const supabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "stale-token", expires_at: 9999999999 } },
          error: null,
        }),
        refreshSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "fresh-token", expires_at: 9999999999 } },
          error: null,
        }),
      },
    };

    await createAuthenticatedApiClient(supabase as never).rawPost(
      "/api/v1/realtime/sessions/conversation-id/connect",
      SDP_OFFER,
      "application/sdp",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    const [, retryRequest] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((retryRequest.headers as Headers).get("Authorization")).toBe("Bearer fresh-token");
  });

  it("retrieves the current session again for a retry after an earlier attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("v=0\no=- answer", { status: 201 }))
      .mockResolvedValueOnce(new Response("v=0\no=- answer", { status: 201 }));
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: "first-token", expires_at: 9999999999 } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: "second-token", expires_at: 9999999999 } }, error: null });
    const supabase = { auth: { getSession } };
    const api = createAuthenticatedApiClient(supabase as never);

    await api.rawPost("/api/v1/realtime/sessions/conversation-id/connect", SDP_OFFER, "application/sdp");
    await api.rawPost("/api/v1/realtime/sessions/conversation-id/connect", SDP_OFFER, "application/sdp");

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get("Authorization")).toBe("Bearer first-token");
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Headers).get("Authorization")).toBe("Bearer second-token");
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
