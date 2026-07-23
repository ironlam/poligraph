import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders both theme marks as decorative images", () => {
    const { container } = render(<Logo />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    imgs.forEach((img) => {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("aria-hidden", "true");
    });
    expect(container.querySelector('img[src="/logo.svg"]')?.className).toContain("dark:hidden");
    expect(container.querySelector('img[src="/logo-inverse.svg"]')?.className).toContain(
      "dark:block"
    );
  });

  it("exposes no accessible name of its own", () => {
    render(<Logo />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders a decorative wordmark only when asked", () => {
    const { rerender } = render(<Logo />);
    expect(screen.queryByText("Poligraph")).toBeNull();
    rerender(<Logo withWordmark />);
    const wordmark = screen.getByText("Poligraph");
    expect(wordmark).toHaveAttribute("aria-hidden", "true");
  });
});
