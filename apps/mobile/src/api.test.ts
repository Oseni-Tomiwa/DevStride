import { createDevStrideApi, MobileApiError } from "./api";

const userResponse = {
  id: "a5ab2808-6304-4c8c-a261-67d6ce2eb4bd",
  email: "ada@example.com",
};

const profileResponse = {
  id: "84985f28-902d-4b71-b6e7-99483e9a5f1e",
  user_id: userResponse.id,
  display_name: "Ada",
  current_level: "mid_level",
  target_role: "backend_engineer",
  preferred_stack: ["Python", "PostgreSQL"],
  communication_goal: "technical_interviews",
  feedback_preference: "balanced",
  onboarding_completed: true,
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-02T12:00:00Z",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createDevStrideApi", () => {
  it("loads the current user and profile with the current bearer token", async () => {
    const fetchImpl = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValueOnce(response(userResponse))
      .mockResolvedValueOnce(response(profileResponse));
    const api = createDevStrideApi({
      apiBaseUrl: "https://api.example.com/",
      getAccessToken: async () => "access-token",
      fetchImpl,
    });

    await expect(api.getCurrentUser()).resolves.toEqual(userResponse);
    await expect(api.getProfile()).resolves.toEqual(profileResponse);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.example.com/api/v1/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/api/v1/profile/me",
      expect.any(Object),
    );
  });

  it("treats a missing or rejected session as unauthorized", async () => {
    const api = createDevStrideApi({
      apiBaseUrl: "https://api.example.com",
      getAccessToken: async () => null,
      fetchImpl: jest.fn(),
    });

    await expect(api.getCurrentUser()).rejects.toMatchObject({
      kind: "unauthorized",
      status: null,
    });
  });

  it("normalizes a 401 response as an expired session", async () => {
    const api = createDevStrideApi({
      apiBaseUrl: "https://api.example.com",
      getAccessToken: async () => "expired-token",
      fetchImpl: jest.fn().mockResolvedValue(response({ detail: "Unauthorized" }, 401)),
    });

    await expect(api.getCurrentUser()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
    });
  });

  it("distinguishes a missing profile", async () => {
    const api = createDevStrideApi({
      apiBaseUrl: "https://api.example.com",
      getAccessToken: async () => "access-token",
      fetchImpl: jest.fn().mockResolvedValue(response({ detail: "Profile not found" }, 404)),
    });

    await expect(api.getProfile()).rejects.toMatchObject({
      kind: "profile_missing",
      status: 404,
    });
  });

  it("turns network failures into a retryable unreachable error", async () => {
    const api = createDevStrideApi({
      apiBaseUrl: "https://api.example.com",
      getAccessToken: async () => "access-token",
      fetchImpl: jest.fn().mockRejectedValue(new TypeError("Network request failed")),
    });

    await expect(api.getProfile()).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        kind: "unreachable",
        status: null,
      }),
    );
  });

  it("rejects malformed API data instead of trusting it", async () => {
    const api = createDevStrideApi({
      apiBaseUrl: "https://api.example.com",
      getAccessToken: async () => "access-token",
      fetchImpl: jest.fn().mockResolvedValue(response({ id: 42, email: [] })),
    });

    await expect(api.getCurrentUser()).rejects.toMatchObject({
      kind: "invalid_response",
      status: 200,
    });
  });
});
