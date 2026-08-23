import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "./account-settings";

const updateUser = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const { exportAccountData, deleteAccount } = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../../../lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser, signInWithPassword, signOut } }),
}));
vi.mock("../api", () => ({ exportAccountData, deleteAccount }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function renderSettings() {
  return render(
    <AccountSettings
      email="ada@example.com"
      emailConfirmedAt="2026-01-02T12:00:00Z"
      createdAt="2025-03-04T10:00:00Z"
    />,
  );
}

function submitEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Change email"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Change email" }));
}

function submitPassword(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "current-password" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

describe("AccountSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    signOut.mockResolvedValue({ error: null });
    exportAccountData.mockResolvedValue({ export_version: "1", account: { email: "ada@example.com" } });
    deleteAccount.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders current account details without profile fields or secrets", () => {
    renderSettings();

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Mar 4, 2025")).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current level")).not.toBeInTheDocument();
    expect(screen.queryByText(/access[_ ]token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/refresh[_ ]token/i)).not.toBeInTheDocument();
  });

  it("validates email and rejects an unchanged address", () => {
    renderSettings();

    submitEmail("not-an-email");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
    expect(updateUser).not.toHaveBeenCalled();

    submitEmail(" ADA@example.com ");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a different email address");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("requests an email change and explains pending confirmation", async () => {
    renderSettings();
    submitEmail("new@example.com");

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Faccount" },
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("current email remains in place");
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByText("new@example.com")).not.toBeInTheDocument();
  });

  it("shows a safe email update error", async () => {
    updateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "internal" } });
    renderSettings();
    submitEmail("new@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not request that email change",
    );
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
  });

  it("rejects mismatched passwords", () => {
    renderSettings();
    submitPassword("password123", "password456");

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("requires the current password before changing it", () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("current password");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("does not change the password when current-password verification fails", async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { message: "invalid" } });
    renderSettings();
    submitPassword("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("current password is incorrect");
    expect(updateUser).not.toHaveBeenCalledWith({ password: "password123" });
  });

  it("updates the signed-in user's password", async () => {
    renderSettings();
    submitPassword("password123", "password123");

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "current-password" }));
    expect(updateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(await screen.findByRole("status")).toHaveTextContent("password has been updated");
  });

  it("shows a safe password update error", async () => {
    updateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "sensitive" } });
    renderSettings();
    submitPassword("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not update your password");
    expect(screen.queryByText("sensitive")).not.toBeInTheDocument();
  });

  it("signs out only the current session", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Sign out this session" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(push).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalled();
  });

  it("confirms and signs out other sessions while retaining this one", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));

    expect(screen.getByText("Other browsers and devices will need to log in again. This session stays active.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "others" }));
    expect(await screen.findByRole("status")).toHaveTextContent("This session remains active");
    expect(push).not.toHaveBeenCalled();
  });

  it("confirms and signs out globally", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    expect(screen.getByText("Every browser and device, including this one, will need to log in again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "global" }));
    expect(push).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalled();
  });

  it("offers a user-scoped export without rendering secrets", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Export my data" }));
    await waitFor(() => expect(exportAccountData).toHaveBeenCalled());
    expect(screen.getByRole("status")).toHaveTextContent("data export is ready");
    expect(screen.queryByText(/service.role|access.token|refresh.token|api.key/i)).not.toBeInTheDocument();
  });

  it("requires typed DELETE before account deletion", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByRole("dialog", { name: "Delete your DevStride account?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/");
  });

  it("offers safe reauthentication when recent authentication is required", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("Recent authentication is required"));
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("sign in again");
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/login?next=%2Faccount",
    );
    expect(push).not.toHaveBeenCalledWith("/");
  });

  it("reports partial deletion accurately when Supabase cleanup fails", async () => {
    deleteAccount.mockRejectedValueOnce(
      new Error("Your DevStride data was deleted, but sign-in account cleanup could not be completed. Please try again."),
    );
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("sign-in account remains");
    expect(screen.queryByText(/No further action was taken/i)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith("/");
  });
});
