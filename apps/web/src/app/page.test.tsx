import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the working product name", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "DevStride" })).toBeInTheDocument();
  });
});
