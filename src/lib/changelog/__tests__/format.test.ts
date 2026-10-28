import { describe, expect, it } from "vitest";
import { buildChangelogRss, formatChangelogDay, type PublicChangelogEntry } from "../format";
import { isChangelogPublishable } from "../publish-guard";

const LABELS = {
  NOUVEAUTE: "Nouveauté",
  AMELIORATION: "Amélioration",
  CORRECTION: "Correction",
  DONNEES: "Données",
} as const;

const entry: PublicChangelogEntry = {
  id: "abc",
  type: "CORRECTION",
  date: "2026-10-25",
  title: "Scrutins & votes <ordre>",
  body: "L'ordre est stable.",
  sourceUrl: "https://github.com/ironlam/poligraph/pull/1190",
};

describe("formatChangelogDay", () => {
  it("writes the calendar day in French, whatever the server timezone", () => {
    expect(formatChangelogDay("2026-10-24")).toBe("24 octobre 2026");
    expect(formatChangelogDay("2026-01-01")).toBe("1 janvier 2026");
  });
});

describe("buildChangelogRss", () => {
  const xml = buildChangelogRss([entry], LABELS, "https://poligraph.fr");

  it("escapes XML special characters in titles", () => {
    expect(xml).toContain("<title>Scrutins &amp; votes &lt;ordre&gt;</title>");
  });

  it("links each item to its anchor on the public page and carries its source", () => {
    expect(xml).toContain('<guid isPermaLink="true">https://poligraph.fr/changelog#abc</guid>');
    expect(xml).toContain("Source : https://github.com/ironlam/poligraph/pull/1190");
  });

  it("dates an item at midnight UTC of its calendar day", () => {
    expect(xml).toContain("<pubDate>Sun, 25 Oct 2026 00:00:00 GMT</pubDate>");
  });

  it("produces a valid empty channel", () => {
    expect(buildChangelogRss([], LABELS, "https://poligraph.fr")).not.toContain("<item>");
  });
});

describe("isChangelogPublishable", () => {
  it("requires a source", () => {
    expect(isChangelogPublishable({ sourceUrl: null })).toBe(false);
    expect(isChangelogPublishable({ sourceUrl: "  " })).toBe(false);
    expect(isChangelogPublishable({ sourceUrl: "https://example.org/pr/1" })).toBe(true);
  });
});
