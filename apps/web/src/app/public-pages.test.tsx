import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import AboutPage from "./about/page";
import AccessibilityPage from "./accessibility/page";
import PrivacyPage from "./privacy/page";
import SupportPage from "./support/page";
import TermsPage from "./terms/page";

describe("public launch pages", () => {
  it("publishes an accurate accessibility statement", () => {
    render(<AccessibilityPage />);
    expect(screen.getByRole("heading", { name: /practice should be open/i })).toBeInTheDocument();
    expect(screen.getByText(/aim to conform to WCAG 2\.2 Level AA/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /support page/i })).toHaveAttribute("href", "/support");
    expect(screen.getByText(/certification or guarantee/i)).toBeInTheDocument();
  });

  it("explains DevStride and offers a start CTA", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { name: /practice the work behind the work/i })).toBeInTheDocument();
    expect(screen.getByText(/AI-powered practice environment/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /create account/i }).some((link) => link.getAttribute("href") === "/sign-up")).toBe(true);
  });

  it("provides support categories without fabricating a contact address", () => {
    render(<SupportPage />);
    expect(screen.getByRole("heading", { name: /clear place to get unstuck/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /account and sign-in/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /microphone and camera/i })).toBeInTheDocument();
    expect(screen.getByText(/support contact details are not configured yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /@/ })).not.toBeInTheDocument();
  });

  it("states the local-only camera and audio behavior", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: /your practice data should stay understandable/i })).toBeInTheDocument();
    expect(screen.getByText(/camera video is a local browser preview only/i)).toBeInTheDocument();
    expect(screen.getByText(/not sent to OpenAI/i)).toBeInTheDocument();
    expect(screen.getByText(/not recorded by DevStride/i)).toBeInTheDocument();
    expect(screen.getByText(/microphone audio is used for realtime AI interaction/i)).toBeInTheDocument();
    expect(screen.getByText(/authenticated users can download a JSON export/i)).toBeInTheDocument();
    expect(screen.getByText(/Mavery Innovative Systems LTD/i)).toBeInTheDocument();
  });

  it("sets practical AI limitations and legal-review status", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: /practice with context/i })).toBeInTheDocument();
    expect(screen.getByText(/AI-generated content can be incomplete or incorrect/i)).toBeInTheDocument();
    expect(screen.getByText(/does not guarantee employment/i)).toBeInTheDocument();
    expect(screen.getByText(/final legal review required before launch/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 18 years old/i)).toBeInTheDocument();
  });
});
