import { describe, expect, it } from "vitest";
import { scrutinOgHeadline, scrutinOgHeadlineSize, scrutinOgSegments } from "../og-card";
import { extractScrutinNumber } from "../scrutin-number";
import type { PublicTitleView } from "../resolve-public-title";

function official(officialTitle: string): PublicTitleView {
  return { mode: "official", officialTitle, officialSourceUrl: null, chips: [] };
}

function policy(policyTitle: string): PublicTitleView {
  return {
    mode: "policy",
    policyTitle,
    policySubtitle: null,
    officialTitle: "la première partie du projet de loi de finances pour 2027 (première lecture).",
    officialSourceUrl: null,
    chips: [],
  };
}

describe("scrutinOgHeadline", () => {
  it("keeps an approved policy title as written", () => {
    const title =
      "L'Assemblée rejette la partie recettes du budget 2027, ce qui fait tomber tout le texte";
    expect(scrutinOgHeadline(policy(title))).toBe(title);
  });

  it("turns an official fragment into a sentence a feed can read alone", () => {
    expect(
      scrutinOgHeadline(
        official("la première partie du projet de loi de finances pour 2027 (première lecture).")
      )
    ).toBe("Vote sur la première partie du projet de loi de finances pour 2027 (première lecture)");
  });

  it("handles an elided article", () => {
    expect(scrutinOgHeadline(official("l'ensemble du projet de loi relatif à l'eau"))).toBe(
      "Vote sur l'ensemble du projet de loi relatif à l'eau"
    );
  });

  it("leaves an official title that already starts with a capital untouched", () => {
    expect(
      scrutinOgHeadline(official("Motion de censure déposée en application de l'article 49"))
    ).toBe("Motion de censure déposée en application de l'article 49");
  });

  it("cuts an overlong title on a word boundary with an ellipsis", () => {
    const long = `l'amendement n° 1234 ${"de la commission des finances ".repeat(10)}`;
    const headline = scrutinOgHeadline(official(long));
    expect(headline.length).toBeLessThanOrEqual(150);
    expect(headline.endsWith("…")).toBe(true);
    expect(headline).not.toMatch(/\s…$/);
  });
});

describe("scrutinOgHeadlineSize", () => {
  it("shrinks as the headline grows so it stays within three lines", () => {
    expect(scrutinOgHeadlineSize("x".repeat(86))).toBe(54);
    expect(scrutinOgHeadlineSize("x".repeat(115))).toBe(46);
    expect(scrutinOgHeadlineSize("x".repeat(150))).toBe(40);
  });
});

describe("scrutinOgSegments", () => {
  it("derives every share from its own count", () => {
    const { total, segments } = scrutinOgSegments({
      votesFor: 0,
      votesAgainst: 458,
      votesAbstain: 2,
    });
    expect(total).toBe(460);
    expect(segments.map((s) => s.count)).toEqual([0, 458, 2]);
    expect(segments[1]?.share).toBeCloseTo(99.565, 2);
    expect(segments[2]?.share).toBeCloseTo(0.435, 2);
    expect(segments.every((s) => s.share >= 0)).toBe(true);
  });

  it("never yields a negative share when rounded values would overshoot 100", () => {
    const { segments } = scrutinOgSegments({ votesFor: 1, votesAgainst: 1, votesAbstain: 1 });
    expect(segments.every((s) => s.share > 0)).toBe(true);
  });

  it("returns zero shares when nothing was counted", () => {
    const { total, segments } = scrutinOgSegments({
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
    });
    expect(total).toBe(0);
    expect(segments.every((s) => s.share === 0)).toBe(true);
  });
});

describe("extractScrutinNumber", () => {
  it("reads both chambers' identifiers", () => {
    expect(extractScrutinNumber("VTANR5L17V9759")).toBe("9759");
    expect(extractScrutinNumber("2024-63")).toBe("63");
    expect(extractScrutinNumber("inconnu")).toBeNull();
  });
});
