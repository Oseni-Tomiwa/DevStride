import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { PublicFooter } from "./public-footer";

describe("PublicFooter", () => {
  it("links to the available public pages", () => {
    render(<PublicFooter />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.queryByText(/coming next/i)).not.toBeInTheDocument();
  });
});
