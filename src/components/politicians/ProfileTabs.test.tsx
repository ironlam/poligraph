import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProfileTabs } from "./ProfileTabs";

// Radix Tabs activates triggers on mousedown (left primary button), not click.
function clickTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
}

// jsdom doesn't ship ResizeObserver; Radix's TabsList uses it via `tabs.tsx`.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Override the global mock so we can assert no RSC navigation is triggered.
const routerReplace = vi.fn();
const routerPush = vi.fn();
const searchParamsRef: { current: URLSearchParams } = { current: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => searchParamsRef.current,
  usePathname: () => "/politiques/eric-coquerel",
}));

function renderTabs(initialSearch: string, opts: { patrimoine?: ReactNode } = {}) {
  const patrimoine =
    "patrimoine" in opts ? (
      opts.patrimoine
    ) : (
      <div data-testid="content-patrimoine">patrimoine-content</div>
    );
  searchParamsRef.current = new URLSearchParams(initialSearch);
  window.history.replaceState(null, "", `/politiques/eric-coquerel?${initialSearch}`);
  return render(
    <ProfileTabs
      profileContent={<div data-testid="content-profil">profil-content</div>}
      careerContent={<div data-testid="content-carriere">carriere-content</div>}
      votesContent={<div data-testid="content-votes">votes-content</div>}
      patrimoineContent={patrimoine}
      factchecksContent={<div data-testid="content-factchecks">factchecks-content</div>}
      affairsContent={<div data-testid="content-affaires">affaires-content</div>}
    />
  );
}

describe("ProfileTabs", () => {
  beforeEach(() => {
    routerReplace.mockClear();
    routerPush.mockClear();
  });

  it("uses the URL ?tab=... to select the initial active tab", () => {
    renderTabs("tab=factchecks");
    expect(screen.getByRole("tab", { name: /fact-checks/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("switches tabs instantly without triggering an RSC navigation", () => {
    renderTabs("tab=factchecks");

    expect(screen.getByRole("tab", { name: /fact-checks/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    clickTab(/affaires/i);

    expect(screen.getByRole("tab", { name: /affaires/i })).toHaveAttribute("aria-selected", "true");

    // The URL is updated via window.history (no RSC roundtrip).
    expect(window.location.search).toBe("?tab=affaires");

    // router.replace/push must NOT be called: that would re-fetch the entire
    // RSC payload (~170 KB on the politician profile) and make tab switching
    // feel "stuck" on slow networks (cf. fix on 2026-05-17).
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("removes ?tab= from the URL when switching back to the default tab", () => {
    renderTabs("tab=affaires");

    clickTab(/profil/i);

    expect(window.location.search).toBe("");
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("selects the patrimoine tab from ?tab=patrimoine when available", () => {
    renderTabs("tab=patrimoine");
    expect(screen.getByRole("tab", { name: /patrimoine/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("falls back to Profil and clears the query when patrimoine is unavailable", () => {
    renderTabs("tab=patrimoine", { patrimoine: null });
    expect(screen.getByRole("tab", { name: /profil/i })).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("");
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
