import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// Both toggles render a placeholder until mounted, and that placeholder is what
// ships in the SSR HTML of every page. `useIsMounted` is stubbed to false so the
// test sees exactly that branch.
vi.mock("@/hooks/useIsMounted", () => ({ useIsMounted: () => false }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: undefined }),
}));

import { ThemeToggle } from "../ThemeToggle";
import { MobileThemeToggle } from "../MobileThemeToggle";

/** Elements a <button> may not contain: its content model is phrasing content. */
const BLOCK_TAGS = [
  "div",
  "p",
  "ul",
  "ol",
  "li",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "table",
  "form",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

describe("placeholders des toggles de thème", () => {
  for (const [name, Component] of [
    ["ThemeToggle", ThemeToggle],
    ["MobileThemeToggle", MobileThemeToggle],
  ] as const) {
    it(`${name} ne met aucun élément de bloc dans son <button>`, () => {
      const { container } = render(<Component />);
      const button = container.querySelector("button");

      expect(button, "le placeholder doit rendre un <button>").toBeTruthy();
      // Assert on the rendered DOM, not on the source: this is what the browser
      // parser sees, and an invalid nesting is what it would silently restructure.
      expect(button!.querySelectorAll(BLOCK_TAGS.join(",")).length).toBe(0);
    });

    it(`${name} garde une cible cliquable de 20px pour son icône`, () => {
      const { container } = render(<Component />);
      const box = container.querySelector("button > span");

      // A span defaults to inline, which would collapse the reserved icon slot
      // and shift the header on mount. The class list must keep it a block.
      expect(box).toBeTruthy();
      expect(box!.className).toContain("block");
      expect(box!.className).toMatch(/\bw-5\b/);
      expect(box!.className).toMatch(/\bh-5\b/);
    });
  }
});
