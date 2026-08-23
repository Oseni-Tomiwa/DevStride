import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the unauthenticated landing page and its actions", async () => {
    render(await HomePage());

    expect(screen.getByRole("link", { name: "DevStride home" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Grow into the engineer/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link", { name: "Create account" })).toHaveLength(2);
    expect(screen.getByText(/AI-powered practice environment for software engineers/i)).toBeInTheDocument();
  });

  it("keeps the public landing page reachable for an authenticated visitor", async () => {
    render(await HomePage());

    expect(screen.getByRole("link", { name: "DevStride home" })).toHaveAttribute("href", "/");
  });
});
