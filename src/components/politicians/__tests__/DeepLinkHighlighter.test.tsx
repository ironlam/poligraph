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

  it("centre une cible courte et aligne en haut une cible plus haute que l'écran", () => {
    const short = document.createElement("div");
    short.id = "affair-court";
    short.getBoundingClientRect = () => ({ height: 200 }) as DOMRect;
    document.body.appendChild(short);
    window.history.replaceState({}, "", "/politiques/x#affair-court");
    const first = render(<DeepLinkHighlighter />);
    expect(short.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "center" })
    );
    first.unmount();
    short.remove();

    const tall = document.createElement("div");
    tall.id = "affaires";
    tall.getBoundingClientRect = () => ({ height: window.innerHeight + 500 }) as DOMRect;
    document.body.appendChild(tall);
    window.history.replaceState({}, "", "/politiques/x?tab=affaires#affaires");
    render(<DeepLinkHighlighter />);
    expect(tall.scrollIntoView).toHaveBeenLastCalledWith(
      expect.objectContaining({ block: "start" })
    );
    tall.remove();
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
