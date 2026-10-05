import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    pressArticle: { findMany: vi.fn(), count: vi.fn() },
    politician: { findMany: vi.fn() },
    affair: { findMany: vi.fn() },
  },
}));

import { scorePressStory, type PressStoryCandidate } from "../recap";

const baseArticle: PressStoryCandidate = {
  articleId: "a1",
  title: "Test",
  feedSource: "lemonde",
  url: "https://lemonde.fr/article/1",
  imageUrl: null,
  publishedAt: new Date("2026-05-04"),
  aiSummary: "Un résumé.",
  isAffairRelated: false,
  mentions: { politicians: [], parties: [], affairs: [] },
};

describe("scorePressStory", () => {
  it("scores +3 for one active politician mention plus +2 for first-time source", () => {
    const article: PressStoryCandidate = {
      ...baseArticle,
      mentions: {
        ...baseArticle.mentions,
        politicians: [{ slug: "x", fullName: "X", party: "P", isActive: true }],
      },
    };
    expect(scorePressStory(article, [], [])).toBe(3 + 2);
  });

  it("scores +5 when affair-related (plus base 3 for active politician + 2 for source)", () => {
    const article: PressStoryCandidate = {
      ...baseArticle,
      mentions: {
        ...baseArticle.mentions,
        politicians: [{ slug: "x", fullName: "X", party: "P", isActive: true }],
        affairs: [{ slug: "af", title: "Aff", involvement: "DIRECT", certaintyLevel: "ETABLI" }],
      },
    };
    expect(scorePressStory(article, [], [])).toBe(3 + 5 + 2);
  });

  it("penalises -3 per repeated politician (and skips +2 source bonus when source already chosen)", () => {
    const article: PressStoryCandidate = {
      ...baseArticle,
      mentions: {
        ...baseArticle.mentions,
        politicians: [{ slug: "x", fullName: "X", party: "P", isActive: true }],
      },
    };
    expect(scorePressStory(article, ["x"], ["lemonde"])).toBe(3 - 3);
  });

  it("penalises -5 when aiSummary is null", () => {
    const article: PressStoryCandidate = {
      ...baseArticle,
      aiSummary: null,
      mentions: {
        ...baseArticle.mentions,
        politicians: [{ slug: "x", fullName: "X", party: "P", isActive: true }],
      },
    };
    expect(scorePressStory(article, [], [])).toBe(3 + 2 - 5);
  });

  it("scores +2 per additional active politician up to 4", () => {
    const article: PressStoryCandidate = {
      ...baseArticle,
      mentions: {
        ...baseArticle.mentions,
        politicians: [
          { slug: "a", fullName: "A", party: null, isActive: true },
          { slug: "b", fullName: "B", party: null, isActive: true },
          { slug: "c", fullName: "C", party: null, isActive: true },
        ],
      },
    };
    // 3 (>=1) + 2*2 (2 additional) + 2 (new source) = 9
    expect(scorePressStory(article, [], [])).toBe(9);
  });
});
