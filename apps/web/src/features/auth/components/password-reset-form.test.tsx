import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PasswordResetForm } from "./password-reset-form";

const updateUser = vi.fn();

vi.mock("../../../lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser } }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("next=%2Faccount"),
}));

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUser.mockResolvedValue({ error: null });
  });

  function fill(password: string, confirmation: string) {
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirmation } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  }

  it("rejects mismatched passwords without calling Supabase", () => {
    render(<PasswordResetForm />);
    fill("password123", "password456");
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and shows success", async () => {
    render(<PasswordResetForm />);
    fill("password123", "password123");

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "password123" }));
    expect(await screen.findByRole("status")).toHaveTextContent("password has been updated");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("handles a rejected recovery session safely", async () => {
    updateUser.mockResolvedValueOnce({ error: { message: "invalid token" } });
    render(<PasswordResetForm />);
    fill("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("reset link may have expired");
    expect(screen.queryByText("invalid token")).not.toBeInTheDocument();
  });
});
