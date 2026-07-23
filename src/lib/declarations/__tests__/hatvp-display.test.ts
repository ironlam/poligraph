import { describe, it, expect } from "vitest";
import {
  cleanRedactions,
  isEmptyPlaceholder,
  displayHatvpText,
  formatEuroExact,
  sortRevenuesAsc,
  sumRevenues,
  coveredPeriod,
} from "@/lib/declarations/hatvp-display";

describe("cleanRedactions", () => {
  it("replaces every redaction token, mid-string too", () => {
    expect(cleanRedactions("Salarié [Données non publiées] par X [Données non publiées]")).toBe(
      "Salarié (non publié) par X (non publié)"
    );
  });
});

describe("isEmptyPlaceholder", () => {
  it("true only when the whole value is a placeholder", () => {
    expect(isEmptyPlaceholder("Néant")).toBe(true);
    expect(isEmptyPlaceholder(" néant ")).toBe(true);
    expect(isEmptyPlaceholder("sans objet")).toBe(true);
    expect(isEmptyPlaceholder(null)).toBe(true);
    expect(isEmptyPlaceholder("")).toBe(true);
  });
  it("false for a real sentence containing 'néant'", () => {
    expect(isEmptyPlaceholder("Le risque est néant sur ce mandat")).toBe(false);
  });
});

describe("displayHatvpText", () => {
  it("returns null for empty placeholders, cleans redactions otherwise", () => {
    expect(displayHatvpText("Néant")).toBeNull();
    expect(displayHatvpText("[Données non publiées]")).toBe("(non publié)");
    expect(displayHatvpText("SCI Les Tilleuls")).toBe("SCI Les Tilleuls");
  });
});

describe("formatEuroExact", () => {
  it("keeps 0 € distinct from a dash", () => {
    expect(formatEuroExact(0)).toBe("0 €");
    expect(formatEuroExact(617000)).toContain("617");
    expect(formatEuroExact(617000)).toContain("€");
  });
});

describe("revenue helpers", () => {
  const rev = [
    { year: 2019, amount: 71416 },
    { year: 2017, amount: 39655 },
  ];
  it("sorts ascending without mutating", () => {
    const copy = [...rev];
    expect(sortRevenuesAsc(rev).map((r) => r.year)).toEqual([2017, 2019]);
    expect(rev).toEqual(copy);
  });
  it("sums only present amounts (no missing-as-zero)", () => {
    expect(sumRevenues(rev)).toBe(111071);
    expect(sumRevenues([])).toBe(0);
  });
  it("covered period from present years", () => {
    expect(coveredPeriod(rev)).toEqual({ from: 2017, to: 2019 });
    expect(coveredPeriod([])).toBeNull();
  });
});
