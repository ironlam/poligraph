import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { DeepLinkHighlighter } from "@/components/politicians/DeepLinkHighlighter";

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("DeepLinkHighlighter", () => {
  it("scrolle et surligne un élément déjà présent, puis retire la surbrillance", () => {
    const el = document.createElement("div");
    el.id = "affair-1";
    document.body.appendChild(el);
    window.history.replaceState({}, "", "/politiques/x#affair-1");

    render(<DeepLinkHighlighter />);

    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(el.classList.contains("cite-target")).toBe(true);
    vi.advanceTimersByTime(2500);
    expect(el.classList.contains("cite-target")).toBe(false);

    el.remove();
  });

  it("ne jette pas quand la cible est absente", () => {
    window.history.replaceState({}, "", "/politiques/x#affair-absent");
    expect(() => render(<DeepLinkHighlighter />)).not.toThrow();
    vi.advanceTimersByTime(2000);
  });

  it("ne fait rien sans hash", () => {
    window.history.replaceState({}, "", "/politiques/x");
    const { unmount } = render(<DeepLinkHighlighter />);
    expect(() => unmount()).not.toThrow();
  });
});
