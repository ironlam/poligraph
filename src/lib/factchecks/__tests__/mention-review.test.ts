import { describe, expect, it } from "vitest";
import {
  CONFIRMED_MENTION_WHERE,
  MENTION_TO_REVIEW_WHERE,
  getConfirmedMentionSqlWhere,
  isSingleWordMention,
  needsMentionReview,
} from "../mention-review";

describe("needsMentionReview", () => {
  it("demande une validation pour un nom de famille seul", () => {
    expect(needsMentionReview({ matchedName: "Gérard", reviewedAt: null })).toBe(true);
  });

  it("ne demande rien pour un nom complet", () => {
    expect(needsMentionReview({ matchedName: "Félicie Gérard", reviewedAt: null })).toBe(false);
  });

  it("ne demande plus rien une fois validée", () => {
    expect(needsMentionReview({ matchedName: "Macron", reviewedAt: new Date() })).toBe(false);
  });

  it("traite un nom absent comme un mot seul : rien ne prouve le lien", () => {
    expect(needsMentionReview({ matchedName: null, reviewedAt: null })).toBe(true);
  });

  it("ignore les espaces en bordure", () => {
    expect(isSingleWordMention("  Leclerc ")).toBe(true);
  });

  it("compte un nom de famille composé comme un nom complet", () => {
    expect(isSingleWordMention("Le Pen")).toBe(false);
  });
});

describe("filtres Prisma et SQL", () => {
  it("les deux filtres Prisma sont exactement complémentaires", () => {
    expect(CONFIRMED_MENTION_WHERE).toEqual({
      OR: [{ reviewedAt: { not: null } }, { matchedName: { contains: " " } }],
    });
    expect(MENTION_TO_REVIEW_WHERE).toEqual({
      reviewedAt: null,
      OR: [{ matchedName: null }, { NOT: { matchedName: { contains: " " } } }],
    });
  });

  it("le filtre SQL suit la même règle sur l'alias demandé", () => {
    for (const alias of ["f", "m"] as const) {
      const sql = getConfirmedMentionSqlWhere(alias).sql;
      expect(sql).toContain(`${alias}."reviewedAt" IS NOT NULL`);
      expect(sql).toContain(`strpos(${alias}."matchedName", ' ') > 0`);
    }
  });
});
