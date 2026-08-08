import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { middleware } from "./middleware";

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }));

vi.mock("./src/lib/supabase/middleware", () => ({ updateSession }));

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users away from protected routes", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const response = await middleware(new NextRequest("http://localhost/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fdashboard",
    );
  });

  it("allows authenticated users through protected routes", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "user-id" },
    });

    const response = await middleware(new NextRequest("http://localhost/onboarding"));

    expect(response.status).toBe(200);
  });
});
