import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("collapses and controls authenticated navigation on mobile", () => {
    render(<AppShell current="profile"><h1>Profile content</h1></AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Authenticated navigation" });
    const menuButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(navigation).not.toHaveClass("app-nav-open");

    fireEvent.click(menuButton);
    expect(screen.getByRole("button", { name: "Close navigation menu" })).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toHaveClass("app-nav-open");
    expect(within(navigation).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    fireEvent.click(within(navigation).getByRole("link", { name: "Conversations" }));
    expect(navigation).not.toHaveClass("app-nav-open");
  });
});
