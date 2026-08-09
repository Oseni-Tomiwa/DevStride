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
