import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPress: vi.fn(),
  getPressStats: vi.fn(),
  getPartiesWithPressMentions: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/data/press", () => ({
  getPress: mocks.getPress,
  getPressStats: mocks.getPressStats,
  getPartiesWithPressMentions: mocks.getPartiesWithPressMentions,
}));
vi.mock("@/components/presse", () => ({
  PressCard: () => null,
  PartyFilterSelect: () => null,
}));
vi.mock("@/components/presse/PresseSearchInput", () => ({
  PresseSearchInput: () => null,
}));
vi.mock("@/components/ui/SimplePagination", () => ({ SimplePagination: () => null }));
vi.mock("@/components/ui/Breadcrumb", () => ({ Breadcrumb: () => null }));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import PressePage from "./page";

describe("page Presse, tris publics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.getPress.mockResolvedValue({ articles: [], total: 0, totalPages: 0 });
    mocks.getPressStats.mockResolvedValue({
      totalArticles: 0,
      bySource: {},
      totalMentions: 0,
      totalPartyMentions: 0,
    });
    mocks.getPartiesWithPressMentions.mockResolvedValue([]);
  });

  it("retire Pertinence et normalise une ancienne URL vers le tri récent", async () => {
    const page = await PressePage({
      searchParams: Promise.resolve({ sort: "relevance" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Récents");
    expect(html).not.toContain("Pertinence");
    expect(html).not.toContain("sort=relevance");
    expect(mocks.getPress).toHaveBeenCalledWith(expect.objectContaining({ sort: "recent" }));
  });
});
