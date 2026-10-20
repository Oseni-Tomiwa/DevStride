import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { MobileAuthBridge } from "./mobile-auth-bridge";

const bridgeOptions = {
  siteOrigin: "https://dev-stride-web.vercel.app",
  supabaseOrigin: "https://project-ref.supabase.co",
};

function bridgeFragment() {
  const url = new URL("https://project-ref.supabase.co/auth/v1/verify");
  url.searchParams.set("token", "safe-token-hash-1234567890");
  url.searchParams.set("type", "signup");
  url.searchParams.set("redirect_to", "devstride://auth/confirm?sb_flow_id=abcdef1234567890");
  return `#${url.toString()}`;
}

describe("MobileAuthBridge", () => {
  it("waits for an explicit action before opening a validated verification URL", () => {
    const navigate = vi.fn();
    render(
      <MobileAuthBridge
        bridgeOptions={bridgeOptions}
        fragment={bridgeFragment()}
        navigate={navigate}
      />,
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/safe-token|project-ref|devstride:\/\//i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to DevStride" }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toMatch(/^https:\/\/project-ref\.supabase\.co\/auth\/v1\/verify\?/);
  });

  it("shows a content-free error and never navigates for malformed input", () => {
    const navigate = vi.fn();
    render(
      <MobileAuthBridge
        bridgeOptions={bridgeOptions}
        fragment="#https://evil.example/auth/v1/verify?token=secret"
        navigate={navigate}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("invalid or expired");
    expect(screen.queryByText(/evil|secret/i)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

});
