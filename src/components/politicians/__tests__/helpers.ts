import { vi } from "vitest";
import { PROFILE_TABS_ANCHOR_ID } from "@/components/politicians/profile-tabs-anchor";

/**
 * Stand-in for the anchor `ProfileTabs` renders, plus the two browser APIs
 * jsdom leaves out (`scrollIntoView`, `matchMedia`). Callers must clean the
 * body and unstub globals afterwards.
 */
export function mountTabsAnchor({ reducedMotion = false } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));

  const anchor = document.createElement("div");
  anchor.id = PROFILE_TABS_ANCHOR_ID;
  anchor.tabIndex = -1;
  anchor.scrollIntoView = vi.fn();
  document.body.appendChild(anchor);
  return anchor;
}
