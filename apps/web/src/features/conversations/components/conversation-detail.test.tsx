import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationDetail } from "./conversation-detail";

const { push, createUserMessage } = vi.hoisted(() => ({
  push: vi.fn(),
  createUserMessage: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ createUserMessage }));

const conversation = {
  id: "conversation-id",
  title: "Practice notes",
  mode: "general",
  persona: null,
  status: "active",
  metadata: {},
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-01T10:00:00Z",
};

const message = (id: string, content: string, created_at: string) => ({
  id,
  conversation_id: conversation.id,
  role: "user",
  content,
  provider: null,
  model: null,
  input_tokens: null,
  output_tokens: null,
  latency_ms: null,
  metadata: {},
  created_at,
});

describe("ConversationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders messages chronologically and prevents blank submissions", () => {
    render(<ConversationDetail conversation={conversation} initialMessages={[
      message("later", "Second", "2026-08-01T11:00:00Z"),
      message("earlier", "First", "2026-08-01T10:00:00Z"),
    ]} />);

    const text = screen.getByRole("region").textContent ?? "";
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"));
    fireEvent.submit(screen.getByRole("button", { name: "Save message" }).closest("form")!);
    expect(createUserMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Write a message before sending.");
  });

  it("trims and persists only the user message content", async () => {
    createUserMessage.mockResolvedValue(message("new", "A saved note", "2026-08-01T12:00:00Z"));
    render(<ConversationDetail conversation={conversation} initialMessages={[]} />);

    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "  A saved note  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));

    await waitFor(() => expect(createUserMessage).toHaveBeenCalledWith({}, "conversation-id", {
      content: "A saved note",
    }));
    expect(screen.getByLabelText("Your message")).toHaveValue("");
    expect(screen.getByText("A saved note")).toBeInTheDocument();
  });
});
