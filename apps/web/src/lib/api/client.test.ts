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
