import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "./forgot-password-form";

const resetPasswordForEmail = vi.fn();

vi.mock("../../../lib/supabase/client", () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("next=https%3A%2F%2Fevil.example"),
}));

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("requests a reset with the PKCE callback and a safe return path", async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Freset-password&returnTo=%2Fdashboard",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("If an account matches");
  });

  it("does not reveal provider errors or account existence", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "email not found" } });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not send reset instructions");
    expect(screen.queryByText("email not found")).not.toBeInTheDocument();
  });

  it("validates the email before calling Supabase", () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));

    expect(screen.getByRole("alert")).toHaveTextContent("valid email");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
