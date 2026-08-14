import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MentorEntry } from "./mentor-entry";

const { createConversation, push } = vi.hoisted(() => ({
  createConversation: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ createConversation }));

describe("MentorEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects Text Mentor by default and starts the text flow", async () => {
    createConversation.mockResolvedValueOnce({ id: "mentor-id" });
    render(<MentorEntry />);

    expect(screen.getByRole("radio", { name: /Text Mentor/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Start Text Mentor" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith({}, {
      title: "Mentor session",
      mode: "mentor",
    }));
    expect(push).toHaveBeenCalledWith("/conversations/mentor-id");
  });

  it("updates the CTA and preserves live voice transport when selected", async () => {
    createConversation.mockResolvedValueOnce({ id: "live-mentor-id" });
    render(<MentorEntry />);

    fireEvent.click(screen.getByRole("radio", { name: /Live Mentor/ }));
    expect(screen.getByRole("button", { name: "Start Live Mentor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Live Mentor" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith({}, {
      title: "Mentor session",
      mode: "mentor",
      mentor_transport: "live_voice",
    }));
    expect(push).toHaveBeenCalledWith("/conversations/live-mentor-id/live-mentor");
  });
});
