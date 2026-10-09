import { describe, expect, it } from "vitest";
import { MEASURE_READER_GUIDES } from "./measure-reader-guides";
import { isOfficialInstitutionUrl } from "@/lib/measures/reader-guide-source";

describe("catalogue des repères citoyens", () => {
  it("utilise des slugs et alias uniques avec une source officielle", () => {
    const slugs = new Set<string>();
    const aliases = new Set<string>();
    for (const guide of MEASURE_READER_GUIDES) {
      expect(slugs.has(guide.slug)).toBe(false);
      slugs.add(guide.slug);
      expect(isOfficialInstitutionUrl(guide.sourceUrl)).toBe(true);
      expect(guide.definition.length).toBeGreaterThan(40);
      for (const alias of [guide.label, ...guide.aliases]) {
        const normalized = alias.toLocaleLowerCase("fr");
        expect(aliases.has(normalized)).toBe(false);
        aliases.add(normalized);
      }
    }
  });
  it("ne rattache pas le C2P au terme générique de pénibilité", () => {
    // A measure about hardship in general, or one replacing the account, must not show the C2P.
    const guide = MEASURE_READER_GUIDES.find(
      (entry) => entry.slug === "compte-professionnel-prevention"
    );
    const terms = [guide?.label, ...(guide?.aliases ?? [])].map((term) =>
      term?.toLocaleLowerCase("fr")
    );
    expect(terms).not.toContain("pénibilité");
    expect(terms).not.toContain("compte pénibilité");
  });
});
