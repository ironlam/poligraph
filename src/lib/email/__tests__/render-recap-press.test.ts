import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    pressArticle: { findMany: vi.fn(), count: vi.fn() },
    politician: { findMany: vi.fn() },
    affair: { findMany: vi.fn() },
  },
}));

import type { PressStory } from "../../data/recap";
import { buildPressStoriesHtml } from "../render-recap";

const baseStory: PressStory = {
  articleId: "a1",
  title: "Le gouvernement annonce un plan",
  feedSource: "Le Monde",
  url: "https://lemonde.fr/article/1",
  imageUrl: null,
  publishedAt: new Date("2026-05-04T10:00:00Z"),
  aiSummary: "Un plan ambitieux annoncé.",
  isAffairRelated: false,
  mentions: { politicians: [], parties: [], affairs: [] },
};

describe("buildPressStoriesHtml", () => {
  it("returns empty string when no stories", () => {
    expect(buildPressStoriesHtml([])).toBe("");
  });

  it("includes the À la une title and the article title with link when stories present", () => {
    const html = buildPressStoriesHtml([baseStory]);
    expect(html).toContain("À la une cette semaine");
    expect(html).toContain("Le gouvernement annonce un plan");
    expect(html).toContain('href="https://lemonde.fr/article/1"');
    expect(html).toContain("Le Monde");
  });

  it("never renders the AI summary, even when present (press neighbouring rights)", () => {
    const html = buildPressStoriesHtml([baseStory]);
    expect(html).not.toContain("Un plan ambitieux annoncé.");
    expect(html).not.toContain("font-style: italic");
    // We link, we don't reproduce: title and source stay, summary never appears.
    expect(html).toContain("Le gouvernement annonce un plan");
    expect(html).toContain('href="https://lemonde.fr/article/1"');
  });

  it("escapes HTML in story title", () => {
    const story: PressStory = { ...baseStory, title: "<script>alert(1)</script>" };
    const html = buildPressStoriesHtml([story]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders at most 3 stories", () => {
    const stories: PressStory[] = Array.from({ length: 5 }).map((_, i) => ({
      ...baseStory,
      articleId: `a${i}`,
      title: `Article ${i}`,
      url: `https://lemonde.fr/article/${i}`,
    }));
    const html = buildPressStoriesHtml(stories);
    expect(html).toContain("Article 0");
    expect(html).toContain("Article 1");
    expect(html).toContain("Article 2");
    expect(html).not.toContain("Article 3");
    expect(html).not.toContain("Article 4");
  });
});
