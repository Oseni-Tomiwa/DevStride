import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../lib/api/client";
import { ProfileForm } from "./profile-form";

const patch = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("../../../lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createAuthenticatedApiClient: () => ({ patch }),
}));

vi.mock("../../../lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const initialValues = {
  display_name: "Ada",
  current_level: "senior" as const,
  target_role: "backend_engineer" as const,
  preferred_stack: "Python, PostgreSQL",
  communication_goal: "technical_interviews" as const,
  feedback_preference: "balanced" as const,
};

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patches editable fields without ownership fields", async () => {
    patch.mockResolvedValueOnce({ id: "profile-id" });
    render(<ProfileForm mode="edit" initialValues={initialValues} />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/profile/me", {
      display_name: "Ada Lovelace",
      current_level: "senior",
      target_role: "backend_engineer",
      preferred_stack: ["Python", "PostgreSQL"],
      communication_goal: "technical_interviews",
      feedback_preference: "balanced",
    }));
    expect(patch.mock.calls[0][1]).not.toHaveProperty("id");
    expect(patch.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(await screen.findByRole("status")).toHaveTextContent("updated");
  });

  it("redirects to onboarding when the profile is missing", async () => {
    patch.mockRejectedValueOnce(new ApiError("Profile not found", 404));
    render(<ProfileForm mode="edit" initialValues={initialValues} />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
  });
});
