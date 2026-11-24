import { describe, it, expect } from "vitest";
import { buildScrutinSlugBase } from "@/lib/votes/scrutin-slug";

const DATE = new Date("2026-11-10T00:00:00Z");
const LONG =
  "l'amendement n° 358 du Gouvernement et les amendements identiques suivants de suppression de l'article 16 bis du projet de loi";

describe("buildScrutinSlugBase", () => {
  it("puts the scrutin number right after the date and cuts at a word boundary", () => {
    const slug = buildScrutinSlugBase({ chamber: "AN", date: DATE, number: "9794", title: LONG });

    expect(slug).toBe(
      "2026-11-10-scrutin-9794-l-amendement-n-358-du-gouvernement-et-les-amendements"
    );
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("keeps the senat- prefix and stays within 80 characters", () => {
    const slug = buildScrutinSlugBase({ chamber: "SENAT", date: DATE, number: "65", title: LONG });

    expect(slug).toBe("senat-2026-11-10-scrutin-65-l-amendement-n-358-du-gouvernement-et-les");
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("gives two same-day scrutins with the same title different slugs", () => {
    const a = buildScrutinSlugBase({ chamber: "AN", date: DATE, number: "9794", title: LONG });
    const b = buildScrutinSlugBase({ chamber: "AN", date: DATE, number: "9795", title: LONG });

    expect(a).not.toBe(b);
  });

  it("falls back to the title alone when the number is unknown", () => {
    expect(
      buildScrutinSlugBase({ chamber: "AN", date: DATE, number: null, title: "Motion de censure" })
    ).toBe("2026-11-10-motion-de-censure");
  });
});
