import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api/client";
import DashboardPage from "./page";

const get = vi.fn();
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: "user@example.com" } } }) },
  }),
}));

vi.mock("../../lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createAuthenticatedApiClient: () => ({ get }),
}));

vi.mock("next/navigation", () => ({ redirect }));

describe("DashboardPage", () => {
  it("redirects authenticated users without a profile to onboarding", async () => {
    get.mockRejectedValueOnce(new ApiError("Profile not found", 404));

    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/onboarding");
    expect(get).toHaveBeenCalledWith("/api/v1/profile/me");
  });
});
