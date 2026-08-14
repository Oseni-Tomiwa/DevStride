import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";

describe("Dialog", () => {
  it("provides a labelled modal and handles Escape", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    render(<Dialog open title="Confirm action" description="This is permanent." onClose={onClose}><button type="button">Confirm</button></Dialog>);

    expect(screen.getByRole("dialog", { name: "Confirm action" })).toHaveAttribute("aria-describedby", "dialog-description");
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
