import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("../../../lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword, signUp } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("logs in with email and password", async () => {
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    }));
    expect(screen.getByRole("link", { name: "DevStride home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Back to DevStride" })).toHaveAttribute("href", "/");
  });

  it("handles email confirmation after sign-up", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthForm mode="sign-up" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Check your email");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows authentication errors", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  });

  it("does not navigate when the session policy cannot be established", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("secure session");
  });
});
