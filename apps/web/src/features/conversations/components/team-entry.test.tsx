import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createConversation } from "../api";
import { TeamEntry } from "./team-entry";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../api", () => ({ createConversation: vi.fn() }));

describe("TeamEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createConversation).mockResolvedValue({ id: "team-conversation" } as never);
  });

  it("collects team configuration and creates an owned team conversation", async () => {
    render(<TeamEntry />);
    fireEvent.click(screen.getByRole("button", { name: "Start Team Practice" }));
    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "architecture_discussion" } });
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "challenging" } });
    fireEvent.click(screen.getByRole("button", { name: "Begin practice" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/conversations/team-conversation"));
    expect(createConversation).toHaveBeenCalledWith({}, {
      title: "Team Practice",
      mode: "team",
      team_scenario: "architecture_discussion",
      team_difficulty: "challenging",
    });
  });
});
