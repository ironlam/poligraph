import { describe, expect, it } from "vitest";
import { AffairStatus } from "@/generated/prisma";
import {
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  addMonthsUtc,
  computeCadenceReview,
  parisDay,
} from "../cadence";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("computeCadenceReview", () => {
  it("PROCES_EN_COURS : un mois", () =>
    expect(computeCadenceReview("PROCES_EN_COURS", d("2026-10-07"))).toEqual({
      nextReviewAt: d("2026-11-07"),
      dueReason: "CADENCE",
    }));
  it("POURVOI_EN_CASSATION : trois mois", () =>
    expect(computeCadenceReview("POURVOI_EN_CASSATION", d("2026-10-07")).nextReviewAt).toEqual(
      d("2027-01-07")
    ));
  it("INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN : six mois", () =>
    expect(
      computeCadenceReview("INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN", d("2026-10-07")).nextReviewAt
    ).toEqual(d("2027-04-07")));
  it("RELAXE : deux mois, motif DELAI_RECOURS", () =>
    expect(computeCadenceReview("RELAXE", d("2026-10-07"))).toEqual({
      nextReviewAt: d("2026-12-07"),
      dueReason: "DELAI_RECOURS",
    }));
});

describe("addMonthsUtc", () => {
  it("31 janvier + 1 mois = 28 février", () =>
    expect(addMonthsUtc(d("2027-01-31"), 1)).toEqual(d("2027-02-28")));
  it("31 janvier 2028 + 1 mois = 29 février", () =>
    expect(addMonthsUtc(d("2028-01-31"), 1)).toEqual(d("2028-02-29")));
});

describe("parisDay", () => {
  it("23 h 30 UTC le 30 novembre = 1er décembre à Paris", () =>
    expect(parisDay(new Date("2026-11-30T23:30:00Z"))).toEqual(d("2026-12-01")));
  it("22 h 30 UTC le 30 juin = 1er juillet à Paris (heure d'été)", () =>
    expect(parisDay(new Date("2026-06-30T22:30:00Z"))).toEqual(d("2026-07-01")));
});

describe("statuts", () => {
  it("chaque statut est ouvert ou terminal, jamais les deux", () => {
    for (const s of Object.values(AffairStatus))
      expect(OPEN_STATUSES.has(s) !== TERMINAL_STATUSES.has(s)).toBe(true);
  });
});
