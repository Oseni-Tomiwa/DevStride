import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountPage from "./page";

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { email: "ada@example.com" } } });
  });

  it("renders authenticated account information without coaching fields", async () => {
    render(await AccountPage());

    expect(screen.getByRole("heading", { name: "Your account." })).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Authenticated navigation" });
    expect(within(navigation).getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
  });

  it("redirects unauthenticated users to login", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });

    await expect(AccountPage()).rejects.toThrow("REDIRECT:/login");
  });
});
