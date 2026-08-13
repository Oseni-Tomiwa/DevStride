import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({ redirect }));

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the unauthenticated landing page and its actions", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    render(await HomePage());

    expect(screen.getByRole("link", { name: "DevStride home" })).toBeInTheDocument();
    expect(screen.getByAltText("DevStride")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Grow into the engineer/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link", { name: "Create account" })).toHaveLength(2);
    expect(screen.getByText(/AI-powered environment for software engineers/i)).toBeInTheDocument();
  });

  it("redirects authenticated users to the dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-id" } } });

    await expect(HomePage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
