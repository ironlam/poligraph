import { describe, it, expect, vi, afterEach } from "vitest";
import { PROFILE_TABS_ANCHOR_ID, revealProfileTabs } from "../profile-tabs-anchor";

function mountAnchor() {
  const el = document.createElement("div");
  el.id = PROFILE_TABS_ANCHOR_ID;
  el.tabIndex = -1;
  // jsdom implements neither scrollIntoView nor matchMedia.
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("revealProfileTabs", () => {
  it("brings the tabs anchor into view", () => {
    stubReducedMotion(false);
    const el = mountAnchor();

    revealProfileTabs();

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("moves focus to the anchor without a second jump", () => {
    stubReducedMotion(false);
    const el = mountAnchor();
    const focus = vi.spyOn(el, "focus");

    revealProfileTabs();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(el);
  });

  it("drops the animation when the visitor asked for reduced motion", () => {
    stubReducedMotion(true);
    const el = mountAnchor();

    revealProfileTabs();

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("stays silent when no tabs are mounted on the page", () => {
    stubReducedMotion(false);

    expect(() => revealProfileTabs()).not.toThrow();
  });
});
