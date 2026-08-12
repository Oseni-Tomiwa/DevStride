import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "./logout-button";

const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("../../../lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs out only the current session and redirects to login", async () => {
    signOut.mockResolvedValue({ error: null });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(push).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalled();
  });

  it("preserves the session and reports an error when logout fails", async () => {
    signOut.mockResolvedValue({ error: { message: "provider details" } });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not log you out. Please try again.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText("provider details")).not.toBeInTheDocument();
  });
});
