import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../lib/api/client";
import { OnboardingForm } from "./onboarding-form";

const post = vi.fn();
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
  createAuthenticatedApiClient: () => ({ post }),
}));

vi.mock("../../../lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByLabelText("Preferred stack"), {
    target: { value: "TypeScript, PostgreSQL" },
  });
}

describe("OnboardingForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the onboarding heading without an escaped HTML entity", () => {
    render(<OnboardingForm />);

    expect(screen.getByRole("heading", { name: "Let’s tailor DevStride to you." })).toBeInTheDocument();
    expect(screen.queryByText(/&apos;/)).not.toBeInTheDocument();
  });

  it("validates required fields before calling the API", async () => {
    render(<OnboardingForm />);

    fireEvent.click(screen.getByRole("button", { name: "Complete onboarding" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("review the highlighted fields");
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the validated profile without user_id and redirects", async () => {
    post.mockResolvedValue({ id: "profile-id" });
    render(<OnboardingForm />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Complete onboarding" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/onboarding", {
      display_name: "Ada",
      current_level: "beginner",
      target_role: "backend_engineer",
      preferred_stack: ["TypeScript", "PostgreSQL"],
      communication_goal: "technical_interviews",
      feedback_preference: "balanced",
    }));
    expect(post.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("handles duplicate onboarding cleanly", async () => {
    const duplicateError = new ApiError("duplicate", 409);
    post.mockRejectedValue(duplicateError);
    render(<OnboardingForm />);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Complete onboarding" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });
});
