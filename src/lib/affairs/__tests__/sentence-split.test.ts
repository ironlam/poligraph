import { describe, it, expect } from "vitest";
import {
  classifySentenceSplit,
  isValidSentenceSplit,
  LIFE_SENTENCE_MONTHS,
} from "@/lib/affairs/sentence-split";

describe("classifySentenceSplit", () => {
  it("rend NONE quand aucun total n'est prononcé", () => {
    expect(classifySentenceSplit(null, null)).toEqual({ kind: "NONE" });
    expect(classifySentenceSplit(0, null)).toEqual({ kind: "NONE" });
  });

  // A zero firm part on an absent term states nothing false, so it is not an error.
  it("rend NONE sur une part ferme nulle sans total", () => {
    expect(classifySentenceSplit(0, 0)).toEqual({ kind: "NONE" });
  });

  it("rend LIFE sur le sentinelle de perpétuité", () => {
    expect(classifySentenceSplit(LIFE_SENTENCE_MONTHS, null)).toEqual({ kind: "LIFE" });
  });

  it("rend UNKNOWN quand la part ferme n'est pas établie", () => {
    expect(classifySentenceSplit(48, null)).toEqual({ kind: "UNKNOWN", totalMonths: 48 });
  });

  it("rend FULLY_SUSPENDED sur une part ferme nulle", () => {
    expect(classifySentenceSplit(48, 0)).toEqual({ kind: "FULLY_SUSPENDED", totalMonths: 48 });
  });

  it("rend FULLY_FIRM quand la part ferme égale le total", () => {
    expect(classifySentenceSplit(48, 48)).toEqual({ kind: "FULLY_FIRM", totalMonths: 48 });
  });

  it("rend MIXED et dérive la part avec sursis", () => {
    expect(classifySentenceSplit(48, 24)).toEqual({
      kind: "MIXED",
      totalMonths: 48,
      firmMonths: 24,
      suspendedMonths: 24,
    });
  });

  // The invariants are application-level and scripts write to the base directly, so the
  // incoherent state is reachable at runtime even though the domain forbids it.
  it("rend INVALID quand la part ferme dépasse le total", () => {
    expect(classifySentenceSplit(48, 60)).toEqual({
      kind: "INVALID",
      totalMonths: 48,
      firmMonths: 60,
    });
  });

  it("rend INVALID quand la part ferme existe sans total", () => {
    expect(classifySentenceSplit(null, 24)).toEqual({
      kind: "INVALID",
      totalMonths: null,
      firmMonths: 24,
    });
  });

  it("rend INVALID sur une part ferme non nulle en perpétuité", () => {
    expect(classifySentenceSplit(LIFE_SENTENCE_MONTHS, 12)).toEqual({
      kind: "INVALID",
      totalMonths: LIFE_SENTENCE_MONTHS,
      firmMonths: 12,
    });
  });

  it("rend INVALID sur une part ferme négative", () => {
    expect(classifySentenceSplit(48, -1)).toEqual({
      kind: "INVALID",
      totalMonths: 48,
      firmMonths: -1,
    });
  });

  // Guards the whole point of the lot: no input may be classified as an established
  // firm term unless the data says so.
  it("ne classe jamais une part ferme absente comme intégralement ferme", () => {
    for (const total of [1, 12, 48, 240, 1200]) {
      expect(classifySentenceSplit(total, null).kind).toBe("UNKNOWN");
    }
  });
});

describe("isValidSentenceSplit", () => {
  it("accepte les combinaisons représentables", () => {
    expect(isValidSentenceSplit(null, null)).toBe(true);
    expect(isValidSentenceSplit(48, null)).toBe(true);
    expect(isValidSentenceSplit(48, 0)).toBe(true);
    expect(isValidSentenceSplit(48, 48)).toBe(true);
    expect(isValidSentenceSplit(48, 24)).toBe(true);
    expect(isValidSentenceSplit(LIFE_SENTENCE_MONTHS, null)).toBe(true);
  });

  it("refuse ce que classifySentenceSplit range en INVALID", () => {
    expect(isValidSentenceSplit(null, 24)).toBe(false);
    expect(isValidSentenceSplit(48, 60)).toBe(false);
    expect(isValidSentenceSplit(LIFE_SENTENCE_MONTHS, 12)).toBe(false);
    expect(isValidSentenceSplit(48, -1)).toBe(false);
  });
});
