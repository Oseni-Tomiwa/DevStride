import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";
import { createSessionPolicyCookie, SESSION_POLICY_COOKIE } from "./src/lib/supabase/session-policy";

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }));

vi.mock("./src/lib/supabase/middleware", () => ({ updateSession }));

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users away from protected routes", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const response = await proxy(new NextRequest("http://localhost/dashboard"));

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

    const policy = await createSessionPolicyCookie();
    const response = await proxy(new NextRequest("http://localhost/onboarding", {
      headers: { cookie: `${SESSION_POLICY_COOKIE}=${policy}` },
    }));

    expect(response.status).toBe(200);
  });

  it("redirects unauthenticated conversation routes to login", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const response = await proxy(new NextRequest("http://localhost/conversations/abc"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fconversations%2Fabc",
    );
  });

  it("rejects an authenticated request when the app session policy is missing", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: { id: "user-id" } });

    const response = await proxy(new NextRequest("http://localhost/account"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Faccount");
  });

  it("preserves only safe internal return paths", async () => {
    updateSession.mockResolvedValue({ response: NextResponse.next(), user: null });

    const response = await proxy(new NextRequest("http://localhost/dashboard?next=https%3A%2F%2Fevil.example"));

    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fdashboard%3Fnext%3Dhttps%253A%252F%252Fevil.example");
  });
});
