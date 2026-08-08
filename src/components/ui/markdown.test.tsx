import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { classifyMarkdownUrl, MarkdownText, MAX_LIST_NESTING_DEPTH } from "./markdown";

function nestedList(depth: number): string {
  return Array.from(
    { length: depth },
    (_, index) => `${"  ".repeat(index)}- Niveau ${index + 1}`
  ).join("\n");
}

describe("classifyMarkdownUrl", () => {
  it.each([
    ["/methodologie", "internal"],
    ["/recherche?q=texte#resultat", "internal"],
    ["https://example.org/source", "external"],
    ["https://example.org/%E2%9C%93", "external"],
    ["http://example.org/source", "external"],
    ["relative/path", "rejected"],
    ["//example.org/source", "rejected"],
    ["custom:destination", "rejected"],
    ["/path\ncontinued", "rejected"],
  ] as const)("classifies %s as %s", (destination, kind) => {
    expect(classifyMarkdownUrl(destination).kind).toBe(kind);
  });
});

describe("MarkdownText", () => {
  it("preserves the supported inline and block formatting", () => {
    const { container } = render(
      <MarkdownText>{`**Titre**\n\nTexte **important**, *nuancé* et\nsuite.\n\n---`}</MarkdownText>
    );

    expect(container.querySelector("h4 strong")).toHaveTextContent("Titre");
    expect(container.querySelector("p strong")).toHaveTextContent("important");
    expect(container.querySelector("em")).toHaveTextContent("nuancé");
    expect(container.querySelector("p br")).toBeInTheDocument();
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("preserves bullet lists and nested lists", () => {
    const { container } = render(<MarkdownText>{`- Premier\n  - Détail\n- Second`}</MarkdownText>);

    const list = container.querySelector("ul");
    expect(list).not.toBeNull();
    expect(within(list!).getAllByRole("listitem")).toHaveLength(3);
    expect(list!.querySelector("ul")).toBeInTheDocument();
  });

  it.each([MAX_LIST_NESTING_DEPTH - 1, MAX_LIST_NESTING_DEPTH, MAX_LIST_NESTING_DEPTH + 1])(
    "bounds list nesting while preserving every item at depth %i",
    (depth) => {
      const { container } = render(<MarkdownText>{nestedList(depth)}</MarkdownText>);

      expect(container.querySelectorAll("ul")).toHaveLength(
        Math.min(depth, MAX_LIST_NESTING_DEPTH)
      );
      expect(container.querySelectorAll("li")).toHaveLength(depth);
      expect(container).toHaveTextContent(`Niveau ${depth}`);
    }
  );

  it("creates only explicitly allowed links", () => {
    render(
      <MarkdownText>{`[Interne](/methodologie) [Externe](https://example.org) [Texte](custom:destination)`}</MarkdownText>
    );

    expect(screen.getByRole("link", { name: "Interne" })).toHaveAttribute("href", "/methodologie");
    expect(screen.getByRole("link", { name: "Externe" })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
    expect(screen.queryByRole("link", { name: "Texte" })).not.toBeInTheDocument();
    expect(screen.getByText("Texte")).toBeInTheDocument();
  });

  it("renders links as text when links are disabled", () => {
    render(<MarkdownText disableLinks>{`[Source](https://example.org)`}</MarkdownText>);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
  });

  it("keeps supplied HTML as text instead of creating active DOM", () => {
    const { container } = render(
      <MarkdownText>{`<span data-marker="present">Texte</span>`}</MarkdownText>
    );

    expect(container.querySelector("span")).not.toBeInTheDocument();
    expect(container.querySelector("[data-marker]")).not.toBeInTheDocument();
    expect(screen.getByText(`<span data-marker="present">Texte</span>`)).toBeInTheDocument();
  });

  it("keeps malformed markup inert", () => {
    const { container } = render(<MarkdownText>{`[Libellé](destination incomplète`}</MarkdownText>);

    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("[Libellé](destination incomplète");
    expect(container.querySelector("[data-unexpected]")).not.toBeInTheDocument();
  });

  it("renders consistently during server rendering", () => {
    const html = renderToStaticMarkup(
      <MarkdownText>{`Texte **accentué** et Unicode : ✓`}</MarkdownText>
    );

    expect(html).toContain("<strong>accentué</strong>");
    expect(html).toContain("Unicode : ✓");
  });
});
