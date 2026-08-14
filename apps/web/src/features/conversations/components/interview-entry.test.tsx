import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterviewEntry } from "./interview-entry";

const { createConversation, push } = vi.hoisted(() => ({
  createConversation: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ createConversation }));

describe("InterviewEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts a technical interview with the selected focus", async () => {
    createConversation.mockResolvedValueOnce({ id: "interview-id" });
    render(<InterviewEntry />);

    fireEvent.click(screen.getByRole("button", { name: "Start Interview Mode" }));
    fireEvent.change(screen.getByLabelText(/Technical focus/), { target: { value: "apis" } });
    fireEvent.click(screen.getByRole("button", { name: "Begin interview" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      {
        title: "Technical interview",
        mode: "interview",
        interview_type: "technical",
        interview_focus: "apis",
      },
    ));
    expect(push).toHaveBeenCalledWith("/conversations/interview-id");
  });

  it("starts a behavioral interview without a technical focus", async () => {
    createConversation.mockResolvedValueOnce({ id: "behavioral-id" });
    render(<InterviewEntry />);

    fireEvent.click(screen.getByRole("button", { name: "Start Interview Mode" }));
    fireEvent.change(screen.getByLabelText("Interview type"), { target: { value: "behavioral" } });
    fireEvent.click(screen.getByRole("button", { name: "Begin interview" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      { title: "Behavioral interview", mode: "interview", interview_type: "behavioral" },
    ));
  });

  it("offers live voice as an explicit interview format", async () => {
    createConversation.mockResolvedValueOnce({ id: "live-id" });
    render(<InterviewEntry />);

    fireEvent.click(screen.getByRole("button", { name: "Start Interview Mode" }));
    fireEvent.click(screen.getByLabelText(/Live voice/));
    fireEvent.click(screen.getByRole("button", { name: "Begin interview" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ interview_transport: "live_voice" }),
    ));
    expect(push).toHaveBeenCalledWith("/conversations/live-id/live-spike");
  });
});
