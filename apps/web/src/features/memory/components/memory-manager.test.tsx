import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryManager } from "./memory-manager";

const { createMemory, updateMemory, deleteMemory } = vi.hoisted(() => ({
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}));

vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ createMemory, updateMemory, deleteMemory }));

const memory = {
  id: "memory-1",
  category: "goal" as const,
  content: "Target backend roles",
  importance: 5,
  confidence: 1,
  source_type: "manual",
  source_id: null,
  status: "active" as const,
  last_reinforced_at: null,
  reinforcement_count: 0,
  created_at: "2026-08-10T10:00:00Z",
  updated_at: "2026-08-10T10:00:00Z",
};

describe("MemoryManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a transparent empty state and adds a memory without ownership fields", async () => {
    createMemory.mockResolvedValue(memory);
    render(<MemoryManager initialMemories={[]} />);
    expect(screen.getByRole("heading", { name: "Nothing saved yet" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What should DevStride remember?"), { target: { value: memory.content } });
    fireEvent.click(screen.getByRole("button", { name: "Add memory" }));
    await waitFor(() => expect(createMemory).toHaveBeenCalledWith({}, { category: "goal", content: memory.content }));
    expect(screen.getByText(memory.content)).toBeInTheDocument();
  });

  it("edits and deletes a memory", async () => {
    updateMemory.mockResolvedValue({ ...memory, content: "Target backend engineering roles" });
    deleteMemory.mockResolvedValue(undefined);
    render(<MemoryManager initialMemories={[memory]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit memory"), { target: { value: "Target backend engineering roles" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMemory).toHaveBeenCalledWith({}, "memory-1", { content: "Target backend engineering roles" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete memory" }));
    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith({}, "memory-1"));
    expect(screen.queryByText("Target backend engineering roles")).not.toBeInTheDocument();
  });
});
