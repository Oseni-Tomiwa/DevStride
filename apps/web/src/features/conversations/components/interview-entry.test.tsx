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
    fireEvent.click(screen.getByLabelText(/Live Interview/));
    fireEvent.click(screen.getByRole("button", { name: "Begin interview" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ interview_transport: "live_voice" }),
    ));
    expect(push).toHaveBeenCalledWith("/conversations/live-id/live-spike");
  });

  it("creates a Video Interview and opens the local-preview route", async () => {
    createConversation.mockResolvedValueOnce({ id: "video-id" });
    render(<InterviewEntry />);

    fireEvent.click(screen.getByRole("button", { name: "Start Interview Mode" }));
    fireEvent.click(screen.getByLabelText(/Video Interview/));
    fireEvent.click(screen.getByRole("button", { name: "Begin interview" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ interview_transport: "video" }),
    ));
    expect(push).toHaveBeenCalledWith("/conversations/video-id/live-video");
  });

  it("keeps Text Interview selected by default with native radio semantics", () => {
    render(<InterviewEntry />);

    fireEvent.click(screen.getByRole("button", { name: "Start Interview Mode" }));
    expect(screen.getByRole("radio", { name: /Text Interview/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Live Interview/ })).not.toBeChecked();
  });

  it("keeps all interview formats available with concise accessible descriptions", () => {
    render(<InterviewEntry />);

    fireEvent.click(screen.getByRole("button", { name: "Start Interview Mode" }));

    expect(screen.getByRole("radio", { name: /Text Interview.*Practice through chat/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Live Interview.*Practice by voice.*Microphone required/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Video Interview.*Practice with camera and voice\. Camera and microphone required\. Camera stays local/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".interview-setup .format-option")).toHaveLength(3);
  });
});
