import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { PublicNav } from "./public-nav";

describe("PublicNav", () => {
  it("opens for mobile navigation and closes on Escape", () => {
    render(<PublicNav />);
    const toggle = screen.getByRole("button", { name: "Open public navigation" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close public navigation" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open public navigation" })).toHaveAttribute("aria-expanded", "false");
  });
});
