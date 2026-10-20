import { describe, it, expect } from "vitest";
import {
  isIndexablePolitician,
  politicianRobotsMetadata,
  SIGNIFICANT_MANDATE_TYPES,
  MAIRE_MIN_COMMUNE_POPULATION,
  MIN_BIOGRAPHY_LENGTH,
  type PoliticianIndexSignals,
} from "../politician-robots";

const NOINDEX = { robots: { index: false, follow: true } };

function signals(overrides: Partial<PoliticianIndexSignals> = {}): PoliticianIndexSignals {
  return {
    mandates: [],
    publishedAffairsCount: 0,
    factCheckMentionsCount: 0,
    declarationsCount: 0,
    biography: null,
    ...overrides,
  };
}

describe("isIndexablePolitician", () => {
  it.each([...SIGNIFICANT_MANDATE_TYPES])(
    "mandate '%s' alone -> indexable (even without any other signal)",
    (type) => {
      expect(isIndexablePolitician(signals({ mandates: [{ type }] }))).toBe(true);
    }
  );

  it("DEPUTE mandate alone (no biography, no other signal) -> NOT indexable", () => {
    expect(isIndexablePolitician(signals({ mandates: [{ type: "DEPUTE" }] }))).toBe(false);
  });

  it("DEPUTE with a biography -> indexable through the biography", () => {
    expect(
      isIndexablePolitician(
        signals({ mandates: [{ type: "DEPUTE" }], biography: "x".repeat(MIN_BIOGRAPHY_LENGTH) })
      )
    ).toBe(true);
  });

  it("DEPUTE with a declaration -> indexable through the declaration", () => {
    expect(
      isIndexablePolitician(signals({ mandates: [{ type: "DEPUTE" }], declarationsCount: 1 }))
    ).toBe(true);
  });

  it("bare RNE-imported maire (small commune, no other signal) -> NOT indexable", () => {
    expect(
      isIndexablePolitician(signals({ mandates: [{ type: "MAIRE", communePopulation: 800 }] }))
    ).toBe(false);
  });

  it("maire of a large commune (>= threshold) -> indexable", () => {
    expect(
      isIndexablePolitician(
        signals({
          mandates: [{ type: "MAIRE", communePopulation: MAIRE_MIN_COMMUNE_POPULATION }],
        })
      )
    ).toBe(true);
  });

  it("maire just below the population threshold -> NOT indexable", () => {
    expect(
      isIndexablePolitician(
        signals({
          mandates: [{ type: "MAIRE", communePopulation: MAIRE_MIN_COMMUNE_POPULATION - 1 }],
        })
      )
    ).toBe(false);
  });

  it("maire with unknown commune population -> indexable (fail-open on missing data)", () => {
    expect(
      isIndexablePolitician(signals({ mandates: [{ type: "MAIRE", communePopulation: null }] }))
    ).toBe(true);
    expect(isIndexablePolitician(signals({ mandates: [{ type: "MAIRE" }] }))).toBe(true);
  });

  it.each(["ADJOINT_MAIRE", "CONSEILLER_MUNICIPAL", "CONSEILLER_DEPARTEMENTAL", "OTHER"])(
    "non-significant mandate '%s' alone -> NOT indexable",
    (type) => {
      expect(isIndexablePolitician(signals({ mandates: [{ type }] }))).toBe(false);
    }
  );

  it("published affair -> indexable", () => {
    expect(isIndexablePolitician(signals({ publishedAffairsCount: 1 }))).toBe(true);
  });

  it("fact-check mention -> indexable", () => {
    expect(isIndexablePolitician(signals({ factCheckMentionsCount: 1 }))).toBe(true);
  });

  it("HATVP declaration -> indexable", () => {
    expect(isIndexablePolitician(signals({ declarationsCount: 1 }))).toBe(true);
  });

  it(`biography >= ${MIN_BIOGRAPHY_LENGTH} chars -> indexable`, () => {
    expect(isIndexablePolitician(signals({ biography: "x".repeat(MIN_BIOGRAPHY_LENGTH) }))).toBe(
      true
    );
  });

  it("short biography -> NOT indexable", () => {
    expect(
      isIndexablePolitician(signals({ biography: "x".repeat(MIN_BIOGRAPHY_LENGTH - 1) }))
    ).toBe(false);
  });

  it("whitespace-padded short biography -> NOT indexable (trimmed)", () => {
    const padded = `  ${"x".repeat(MIN_BIOGRAPHY_LENGTH - 10)}  `.padEnd(
      MIN_BIOGRAPHY_LENGTH + 20,
      " "
    );
    expect(isIndexablePolitician(signals({ biography: padded }))).toBe(false);
  });

  it("zero signals -> NOT indexable", () => {
    expect(isIndexablePolitician(signals())).toBe(false);
  });

  it("mixed: small-commune maire WITH a published affair -> indexable", () => {
    expect(
      isIndexablePolitician(
        signals({
          mandates: [{ type: "MAIRE", communePopulation: 300 }],
          publishedAffairsCount: 1,
        })
      )
    ).toBe(true);
  });
});

describe("politicianRobotsMetadata", () => {
  it("rich profile -> {} (inherits index:true)", () => {
    expect(politicianRobotsMetadata(signals({ mandates: [{ type: "SENATEUR" }] }))).toEqual({});
  });

  it("bare profile -> noindex,follow", () => {
    expect(politicianRobotsMetadata(signals())).toEqual(NOINDEX);
  });
});
