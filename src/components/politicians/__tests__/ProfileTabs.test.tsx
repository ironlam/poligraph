import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileTabs } from "@/components/politicians/ProfileTabs";
import { PROFILE_TABS_ANCHOR_ID } from "@/components/politicians/profile-tabs-anchor";

// TabsList watches its own width to fade the horizontal scroll edges; jsdom
// ships no ResizeObserver.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

function renderTabs() {
  return render(
    <ProfileTabs
      profileContent={<p>contenu profil</p>}
      careerContent={<p>contenu carrière</p>}
      votesContent={null}
      patrimoineContent={null}
      factchecksContent={null}
      affairsContent={<p>contenu affaires</p>}
    />
  );
}

describe("ProfileTabs", () => {
  it("exposes exactly one anchor for the shortcuts to target", () => {
    const { container } = renderTabs();

    expect(container.querySelectorAll(`#${PROFILE_TABS_ANCHOR_ID}`)).toHaveLength(1);
  });

  it("makes the anchor focusable without adding it to the tab order", () => {
    const { container } = renderTabs();

    expect(container.querySelector(`#${PROFILE_TABS_ANCHOR_ID}`)).toHaveAttribute("tabindex", "-1");
  });

  it("keeps the anchor clear of the sticky header once scrolled to", () => {
    const { container } = renderTabs();

    // The site header is `sticky top-0` and 4rem tall, so an anchor aligned to
    // the very top of the viewport would land underneath it.
    expect(container.querySelector(`#${PROFILE_TABS_ANCHOR_ID}`)?.className).toMatch(/scroll-mt-/);
  });

  it("still renders the tab list", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: /Carrière/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Profil/ })).toBeInTheDocument();
  });
});
