import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("AppShell", () => {
  it("renders accessible shared navigation, main content, and footer", () => {
    const { container } = render(
      <AppShell current="profile">
        <h1>Profile content</h1>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "DevStride dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("DevStride")).toHaveLength(2);

    const navigation = screen.getByRole("navigation", { name: "Authenticated navigation" });
    expect(within(navigation).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Account" })).not.toHaveAttribute("aria-current");

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Focused practice for software engineers.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(within(footer).getByText(new RegExp(`${new Date().getUTCFullYear()} DevStride`))).toBeInTheDocument();
  });
});
