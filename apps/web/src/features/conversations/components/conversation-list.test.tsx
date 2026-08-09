import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationList } from "./conversation-list";

const { push, createConversation, renameConversation, deleteConversation } = vi.hoisted(() => ({
  push: vi.fn(),
  createConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ createConversation, renameConversation, deleteConversation }));

const firstConversation = {
  id: "first",
  title: "Older notes",
  mode: "general",
  persona: null,
  status: "active",
  metadata: {},
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-01T10:00:00Z",
};

const secondConversation = { ...firstConversation, id: "second", title: "Latest notes", updated_at: "2026-08-02T10:00:00Z" };

describe("ConversationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it("shows an empty state and creates a new conversation", async () => {
    createConversation.mockResolvedValue({ ...firstConversation, id: "created" });
    render(<ConversationList initialConversations={[]} />);

    expect(screen.getByRole("heading", { name: "No conversations yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith({}, {
      title: "New conversation",
      mode: "general",
    }));
    expect(push).toHaveBeenCalledWith("/conversations/created");
  });

  it("sorts populated conversations newest first and supports rename/delete", async () => {
    renameConversation.mockResolvedValue({ ...secondConversation, title: "Renamed" });
    deleteConversation.mockResolvedValue(undefined);
    render(<ConversationList initialConversations={[firstConversation, secondConversation]} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Latest notes");

    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    fireEvent.change(screen.getByLabelText("Conversation title"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(renameConversation).toHaveBeenCalledWith({}, "second", { title: "Renamed" }));
    expect(await screen.findByText("Renamed")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith({}, "second"));
    expect(screen.queryByText("Renamed")).not.toBeInTheDocument();
  });
});
