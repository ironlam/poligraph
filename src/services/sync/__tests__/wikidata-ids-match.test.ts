import { describe, it, expect } from "vitest";
import { findBestMatch, type WikidataCandidate } from "../wikidata-ids-match";

const candidate = (overrides: Partial<WikidataCandidate>): WikidataCandidate => ({
  id: "Q1",
  label: "Louis Michel",
  isFrench: true,
  isPolitician: false,
  birthDate: null,
  ...overrides,
});

const MAYOR_BIRTH = new Date("1952-04-24");

/**
 * The 5-6 April 2026 run linked 26 101 politicians by name. At least 103 small-town
 * mayors got a historical namesake: the painter Louis-Michel van Loo (1707), the
 * bishop John Dubois (1764), a general, a "criminel français". Their death date
 * and photo were imported from that namesake.
 */
describe("findBestMatch", () => {
  it("refuses a lone French candidate whose birth date disagrees", () => {
    const painter = candidate({ id: "Q381299", birthDate: new Date("1707-03-02") });

    expect(findBestMatch([painter], MAYOR_BIRTH)).toBeNull();
  });

  it("refuses a lone politician candidate whose birth date disagrees", () => {
    const namesake = candidate({ isPolitician: true, birthDate: new Date("1753-01-01") });

    expect(findBestMatch([namesake], MAYOR_BIRTH)).toBeNull();
  });

  it("refuses a candidate without a birth date", () => {
    expect(findBestMatch([candidate({ isPolitician: true })], MAYOR_BIRTH)).toBeNull();
  });

  it("refuses everything when the politician's birth date is unknown", () => {
    const sure = candidate({ isPolitician: true, birthDate: MAYOR_BIRTH });

    expect(findBestMatch([sure], null)).toBeNull();
  });

  it("accepts the one candidate whose birth date agrees, within the timezone slack", () => {
    const painter = candidate({ id: "Q381299", birthDate: new Date("1707-03-02") });
    const mayor = candidate({ id: "Q63765778", birthDate: new Date("1952-04-23T23:00:00Z") });

    expect(findBestMatch([painter, mayor], MAYOR_BIRTH)?.id).toBe("Q63765778");
  });

  it("refuses two candidates born the same day", () => {
    const a = candidate({ id: "Q1", birthDate: MAYOR_BIRTH });
    const b = candidate({ id: "Q2", birthDate: MAYOR_BIRTH });

    expect(findBestMatch([a, b], MAYOR_BIRTH)).toBeNull();
  });
});
