import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { AssistantMarkdown } from "./assistant-markdown";

describe("AssistantMarkdown", () => {
  it("renders developer-oriented Markdown structures", () => {
    render(<AssistantMarkdown content={'# REST APIs\n\nUse **clear** boundaries and `GET /users`.\n\n- One resource\n- Another resource\n\n1. Define the contract\n2. Test the edge cases\n\n> Keep the interface stable.\n\n[Read the docs](https://example.com)\n\n| Method | Purpose |\n| --- | --- |\n| GET | Read data |\n\n```ts\nconst answer = await fetch("/api");\n```'} />);

    expect(screen.getByRole("heading", { name: "REST APIs" })).toBeInTheDocument();
    expect(screen.getByText("GET /users")).toHaveClass("inline-code");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("Keep the interface stable.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the docs" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText('const answer = await fetch("/api");')).toHaveClass("language-ts");
  });

  it("keeps raw HTML inert and rejects unsafe links", () => {
    const { container } = render(<AssistantMarkdown content={'<script>alert("x")</script> [bad](javascript:alert(1))'} />);

    expect(screen.queryByRole("script")).not.toBeInTheDocument();
    expect(container.querySelector("p")?.textContent).toContain('<script>alert("x")</script>');
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument();
    expect(container.querySelector("p")?.textContent).toContain("[bad](javascript:alert(1))");
  });

  it("renders an incomplete streamed fence as readable code", () => {
    render(<AssistantMarkdown content={"```python\nprint('still streaming')"} />);

    expect(screen.getByText("print('still streaming')")).toBeInTheDocument();
    expect(screen.getByText("print('still streaming')").closest("pre")).toHaveClass("code-block");
  });
});
