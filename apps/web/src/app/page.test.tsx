import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the unauthenticated landing page and its actions", async () => {
    render(await HomePage());

    expect(screen.getAllByRole("link", { name: "DevStride home" })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /Grow into the engineer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link", { name: "Start practicing" })).toHaveLength(3);
    expect(screen.getByText(/Practice real engineering conversations/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-it-works");
  });

  it("keeps the public landing page reachable for an authenticated visitor", async () => {
    render(await HomePage());

    expect(screen.getByRole("heading", { name: /Before you take your next stride/i })).toBeInTheDocument();
    expect(screen.getAllByText(/camera video is not sent to OpenAI/i)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/sign-up");
  });
});
