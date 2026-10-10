import { describe, expect, it } from "vitest";
import { PRESIDENCIES, presidencyOfGovernment, presidencyOn } from "@/config/presidencies";

describe("presidencyOn", () => {
  it("inclut le premier jour : Debré, nommé le 8 janvier 1959", () => {
    expect(presidencyOn("1959-01-08")?.slug).toBe("de-gaulle");
    expect(presidencyOn("1959-01-07")).toBeNull();
  });

  it("inclut le dernier jour d'une présidence suivie d'un intérim", () => {
    expect(presidencyOn("1969-04-28")?.slug).toBe("de-gaulle");
    expect(presidencyOn("1969-04-29")).toBeNull();
    expect(presidencyOn("1974-04-02")?.slug).toBe("pompidou");
    expect(presidencyOn("1974-04-03")).toBeNull();
  });

  it("donne le jour de passation au président entrant", () => {
    expect(presidencyOn("2012-05-15")?.slug).toBe("hollande");
    expect(presidencyOn("1995-05-17")?.slug).toBe("chirac");
    expect(presidencyOn("1981-05-21")?.slug).toBe("mitterrand");
    expect(presidencyOn("2012-05-14")?.slug).toBe("sarkozy");
  });

  it("présidence en cours sans fin", () => {
    expect(presidencyOn("2026-10-10")?.slug).toBe("macron");
  });
});

describe("presidencyOfGovernment", () => {
  it("suit la nomination du Premier ministre", () => {
    expect(presidencyOfGovernment({ primeMinisterAppointedAt: "2017-05-15" })?.slug).toBe("macron");
    expect(presidencyOfGovernment({ primeMinisterAppointedAt: "2016-12-06" })?.slug).toBe(
      "hollande"
    );
  });
});

describe("PRESIDENCIES", () => {
  it("chronologique, slugs uniques, sources https", () => {
    const froms = PRESIDENCIES.map((p) => p.from);
    expect([...froms].sort()).toEqual(froms);
    expect(new Set(PRESIDENCIES.map((p) => p.slug)).size).toBe(PRESIDENCIES.length);
    for (const p of PRESIDENCIES) {
      expect(p.sourceUrl === null || p.sourceUrl.startsWith("https://")).toBe(true);
      expect(p.to === null || p.from <= p.to).toBe(true);
    }
  });
});
